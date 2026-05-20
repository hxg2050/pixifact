use serde::Serialize;
use std::{
    collections::{HashMap, VecDeque},
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    thread,
};
use tauri::State;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectFileTreeNode {
    id: String,
    name: String,
    path: String,
    kind: String,
    depth: usize,
    system_path: String,
    children: Option<Vec<ProjectFileTreeNode>>,
    detail: Option<String>,
}

#[derive(Default)]
struct RunProcessStore {
    sessions: Mutex<HashMap<String, RunProcessSession>>,
}

struct RunProcessSession {
    child: std::process::Child,
    stdout: Arc<Mutex<VecDeque<String>>>,
    stderr: Arc<Mutex<VecDeque<String>>>,
    exit_code: Arc<Mutex<Option<i32>>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RunProcessOutput {
    session_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RunProcessStatus {
    session_id: String,
    running: bool,
    exit_code: Option<i32>,
    stdout: Vec<String>,
    stderr: Vec<String>,
}

#[tauri::command]
fn pick_project_folder() -> Result<Option<ProjectFileTreeNode>, String> {
    let Some(path) = rfd::FileDialog::new().pick_folder() else {
        return Ok(None);
    };
    read_project_file_tree(path_to_string(&path)).map(Some)
}

#[tauri::command]
fn read_project_file_tree(project_root_path: String) -> Result<ProjectFileTreeNode, String> {
    let root = canonicalize_existing_path(&project_root_path)?;
    read_directory(&root, &root, 0)
}

#[tauri::command]
fn read_project_file_text(project_root_path: String, file_path: String) -> Result<String, String> {
    let file = resolve_project_path(&project_root_path, &file_path)?;
    fs::read_to_string(file).map_err(error_message)
}

#[tauri::command]
fn read_project_file_bytes(project_root_path: String, file_path: String) -> Result<Vec<u8>, String> {
    let file = resolve_project_path(&project_root_path, &file_path)?;
    fs::read(file).map_err(error_message)
}

#[tauri::command]
fn write_project_file_text(
    project_root_path: String,
    file_path: String,
    content: String,
) -> Result<(), String> {
    let file = resolve_project_path(&project_root_path, &file_path)?;
    fs::write(file, content).map_err(error_message)
}

#[tauri::command]
fn create_project_file(
    project_root_path: String,
    directory_path: String,
    file_name: String,
    content: String,
) -> Result<String, String> {
    validate_entry_name(&file_name)?;
    let root = canonicalize_existing_path(&project_root_path)?;
    let directory = resolve_project_path(&project_root_path, &directory_path)?;
    let file = directory.join(&file_name);
    ensure_within_project(&root, &file)?;
    if file.exists() {
        return Err(format!("已存在 {file_name}。"));
    }
    fs::write(&file, content).map_err(error_message)?;
    relative_project_path(&root, &file)
}

#[tauri::command]
fn create_project_directory(
    project_root_path: String,
    directory_path: String,
    name: String,
) -> Result<String, String> {
    validate_entry_name(&name)?;
    let root = canonicalize_existing_path(&project_root_path)?;
    let directory = resolve_project_path(&project_root_path, &directory_path)?;
    let next = directory.join(&name);
    ensure_within_project(&root, &next)?;
    if next.exists() {
        return Err(format!("已存在 {name}。"));
    }
    fs::create_dir(&next).map_err(error_message)?;
    relative_project_path(&root, &next)
}

#[tauri::command]
fn delete_project_entry(
    project_root_path: String,
    file_path: String,
    recursive: bool,
) -> Result<(), String> {
    let root = canonicalize_existing_path(&project_root_path)?;
    let target = resolve_project_path(&project_root_path, &file_path)?;
    if target == root {
        return Err("不能删除项目根目录。".to_string());
    }
    if target.is_dir() {
        if recursive {
            fs::remove_dir_all(target).map_err(error_message)
        } else {
            fs::remove_dir(target).map_err(error_message)
        }
    } else {
        fs::remove_file(target).map_err(error_message)
    }
}

#[tauri::command]
fn rename_project_entry(
    project_root_path: String,
    file_path: String,
    name: String,
) -> Result<String, String> {
    validate_entry_name(&name)?;
    let root = canonicalize_existing_path(&project_root_path)?;
    let target = resolve_project_path(&project_root_path, &file_path)?;
    if target == root {
        return Err("不能重命名项目根目录。".to_string());
    }
    let Some(parent) = target.parent() else {
        return Err("找不到父目录。".to_string());
    };
    let next = parent.join(&name);
    ensure_within_project(&root, &next)?;
    if next.exists() {
        return Err(format!("已存在 {name}。"));
    }
    fs::rename(&target, &next).map_err(error_message)?;
    relative_project_path(&root, &next)
}

#[tauri::command]
fn open_code_file(project_root_path: String, file_path: String) -> Result<(), String> {
    let root = canonicalize_existing_path(&project_root_path)?;
    let file = resolve_project_path(&project_root_path, &file_path)?;
    let project_uri = format!("--folder-uri={}", path_to_file_uri(&root));
    let file_uri = format!("--file-uri={}", path_to_file_uri(&file));
    Command::new("code")
        .arg("--reuse-window")
        .arg(project_uri)
        .arg(file_uri)
        .spawn()
        .map_err(error_message)?;
    Ok(())
}

#[tauri::command]
fn open_default_file(project_root_path: String, file_path: String) -> Result<(), String> {
    let file = resolve_project_path(&project_root_path, &file_path)?;
    open_with_default_app(&file)
}

#[tauri::command]
fn start_run_process(
    store: State<RunProcessStore>,
    project_root_path: String,
    command: String,
    args: Vec<String>,
    cwd: String,
    url: Option<String>,
) -> Result<RunProcessOutput, String> {
    let root = canonicalize_existing_path(&project_root_path)?;
    let cwd_path = resolve_run_cwd(&root, &cwd)?;
    let mut child = Command::new(&command)
        .args(args)
        .current_dir(cwd_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(error_message)?;

    let stdout = Arc::new(Mutex::new(VecDeque::new()));
    let stderr = Arc::new(Mutex::new(VecDeque::new()));
    let exit_code = Arc::new(Mutex::new(None));

    if let Some(stdout_pipe) = child.stdout.take() {
        collect_output(stdout_pipe, Arc::clone(&stdout));
    }
    if let Some(stderr_pipe) = child.stderr.take() {
        collect_output(stderr_pipe, Arc::clone(&stderr));
    }

    let mut sessions = store.sessions.lock().map_err(error_message)?;
    let session_id = next_run_session_id(&sessions);
    sessions.insert(session_id.clone(), RunProcessSession {
        child,
        stdout: Arc::clone(&stdout),
        stderr: Arc::clone(&stderr),
        exit_code: Arc::clone(&exit_code),
    });
    drop(sessions);

    if let Some(target_url) = url {
        if let Err(error) = open_url_with_default_app(&target_url) {
            push_capped(&stderr, format!("Failed to open run.url: {error}"));
        }
    }

    Ok(RunProcessOutput { session_id })
}

#[tauri::command]
fn get_run_process_status(
    store: State<RunProcessStore>,
    session_id: String,
) -> Result<RunProcessStatus, String> {
    let mut sessions = store.sessions.lock().map_err(error_message)?;
    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| "找不到运行会话。".to_string())?;
    run_process_status(&session_id, session)
}

#[tauri::command]
fn stop_run_process(
    store: State<RunProcessStore>,
    session_id: String,
) -> Result<RunProcessStatus, String> {
    let mut sessions = store.sessions.lock().map_err(error_message)?;
    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| "找不到运行会话。".to_string())?;
    let _ = session.child.kill();
    let _ = session.child.wait();
    if let Ok(mut exit_code) = session.exit_code.lock() {
        if exit_code.is_none() {
            *exit_code = Some(0);
        }
    }
    run_process_status(&session_id, session)
}

pub fn run() {
    tauri::Builder::default()
        .manage(RunProcessStore::default())
        .invoke_handler(tauri::generate_handler![
            pick_project_folder,
            read_project_file_tree,
            read_project_file_text,
            read_project_file_bytes,
            write_project_file_text,
            create_project_file,
            create_project_directory,
            delete_project_entry,
            rename_project_entry,
            open_code_file,
            open_default_file,
            start_run_process,
            get_run_process_status,
            stop_run_process,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Pixifact desktop host");
}

fn read_directory(root: &Path, directory: &Path, depth: usize) -> Result<ProjectFileTreeNode, String> {
    let mut entries = fs::read_dir(directory)
        .map_err(error_message)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(error_message)?;
    entries.sort_by(|left, right| {
        let left_is_dir = left.path().is_dir();
        let right_is_dir = right.path().is_dir();
        right_is_dir
            .cmp(&left_is_dir)
            .then_with(|| left.file_name().cmp(&right.file_name()))
    });

    let mut children = Vec::new();
    for entry in entries {
        let path = entry.path();
        if path.is_dir() {
            children.push(read_directory(root, &path, depth + 1)?);
            continue;
        }

        let name = file_name(&path)?;
        let relative_path = relative_project_path(root, &path)?;
        let kind = project_file_kind(&name, &relative_path);
        let detail = if kind == "component" {
            component_type_from_path(&relative_path)
        } else {
            None
        };
        children.push(ProjectFileTreeNode {
            id: relative_path.clone(),
            name,
            path: relative_path,
            kind,
            depth: depth + 1,
            system_path: path_to_string(&path),
            children: None,
            detail,
        });
    }

    let relative_path = relative_project_path(root, directory)?;
    Ok(ProjectFileTreeNode {
        id: relative_path.clone(),
        name: file_name(directory)?,
        path: relative_path,
        kind: "folder".to_string(),
        depth,
        system_path: path_to_string(directory),
        children: Some(children),
        detail: None,
    })
}

fn project_file_kind(name: &str, path: &str) -> String {
    let lower_name = name.to_ascii_lowercase();
    let lower_path = path.to_ascii_lowercase();
    if lower_name.ends_with(".scene") {
        return "scene".to_string();
    }
    if matches!(
        Path::new(&lower_name).extension().and_then(|ext| ext.to_str()),
        Some("ts" | "tsx" | "js" | "jsx" | "mjs" | "cjs")
    ) {
        if lower_path.contains("/components/") || name.ends_with("Binding.ts") || name.ends_with("Binding.tsx") {
            return "component".to_string();
        }
        return "script".to_string();
    }
    if matches!(
        Path::new(&lower_name).extension().and_then(|ext| ext.to_str()),
        Some("png" | "jpg" | "jpeg" | "webp" | "gif" | "svg")
    ) {
        return "asset".to_string();
    }
    if matches!(
        Path::new(&lower_name).extension().and_then(|ext| ext.to_str()),
        Some("md" | "txt")
    ) {
        return "doc".to_string();
    }
    "unknown".to_string()
}

fn component_type_from_path(path: &str) -> Option<String> {
    let name = Path::new(path).file_name()?.to_str()?;
    let stem = name
        .strip_suffix("Binding.ts")
        .or_else(|| name.strip_suffix("Binding.tsx"))?;
    Some(format!("ui.{stem}"))
}

fn canonicalize_existing_path(path: &str) -> Result<PathBuf, String> {
    fs::canonicalize(path).map_err(error_message)
}

fn resolve_project_path(project_root_path: &str, file_path: &str) -> Result<PathBuf, String> {
    let root = canonicalize_existing_path(project_root_path)?;
    let root_name = file_name(&root)?;
    let root_prefix = format!("{root_name}/");
    let project_relative_path = if file_path == root_name {
        ""
    } else {
        file_path.strip_prefix(&root_prefix).unwrap_or(file_path)
    };
    let relative = Path::new(project_relative_path);
    let candidate = if relative == Path::new(".") || project_relative_path.is_empty() {
        root.clone()
    } else if relative.is_absolute() {
        relative.to_path_buf()
    } else {
        root.join(relative)
    };
    let resolved = canonicalize_existing_path(&path_to_string(&candidate))?;
    ensure_within_project(&root, &resolved)?;
    Ok(resolved)
}

fn resolve_run_cwd(root: &Path, cwd: &str) -> Result<PathBuf, String> {
    let relative = Path::new(cwd);
    if relative.is_absolute() {
        return Err("run.cwd 必须是项目相对路径。".to_string());
    }
    let candidate = if relative == Path::new(".") {
        root.to_path_buf()
    } else {
        root.join(relative)
    };
    let resolved = canonicalize_existing_path(&path_to_string(&candidate))?;
    ensure_within_project(root, &resolved)?;
    Ok(resolved)
}

fn ensure_within_project(root: &Path, path: &Path) -> Result<(), String> {
    if path.starts_with(root) {
        Ok(())
    } else {
        Err("目标路径不在当前项目目录内。".to_string())
    }
}

fn relative_project_path(root: &Path, path: &Path) -> Result<String, String> {
    let relative = path.strip_prefix(root).map_err(error_message)?;
    if relative.as_os_str().is_empty() {
        return Ok(file_name(root)?);
    }
    Ok(format!("{}/{}", file_name(root)?, path_to_string(relative)))
}

fn validate_entry_name(name: &str) -> Result<(), String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("名称不能为空。".to_string());
    }
    if matches!(trimmed, "." | "..") {
        return Err("名称不能是 . 或 ..。".to_string());
    }
    if trimmed
        .chars()
        .any(|ch| matches!(ch, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') || ch.is_control())
    {
        return Err("名称不能包含 / \\ : * ? \" < > | 等字符。".to_string());
    }
    Ok(())
}

fn file_name(path: &Path) -> Result<String, String> {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(String::from)
        .ok_or_else(|| "无法解析文件名。".to_string())
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn path_to_file_uri(path: &Path) -> String {
    format!("file://{}", encode_file_uri_path(&path_to_string(path)))
}

fn encode_file_uri_path(path: &str) -> String {
    path.bytes().fold(String::new(), |mut encoded, byte| {
        match byte {
            b'A'..=b'Z'
            | b'a'..=b'z'
            | b'0'..=b'9'
            | b'-'
            | b'_'
            | b'.'
            | b'~'
            | b'/' => encoded.push(byte as char),
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
        encoded
    })
}

fn error_message(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn monotonic_millis() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn next_run_session_id(sessions: &HashMap<String, RunProcessSession>) -> String {
    let base = format!("run-{}", monotonic_millis());
    if !sessions.contains_key(&base) {
        return base;
    }
    let mut index = 1;
    loop {
        let candidate = format!("{base}-{index}");
        if !sessions.contains_key(&candidate) {
            return candidate;
        }
        index += 1;
    }
}

fn push_capped(lines: &Arc<Mutex<VecDeque<String>>>, line: String) {
    let Ok(mut lines) = lines.lock() else {
        return;
    };
    lines.push_back(line);
    while lines.len() > 80 {
        lines.pop_front();
    }
}

fn collect_output<R>(reader: R, target: Arc<Mutex<VecDeque<String>>>)
where
    R: std::io::Read + Send + 'static,
{
    thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        let reader = BufReader::new(reader);
        for line in reader.lines().map_while(Result::ok) {
            push_capped(&target, line);
        }
    });
}

fn snapshot_lines(lines: &Arc<Mutex<VecDeque<String>>>) -> Result<Vec<String>, String> {
    Ok(lines.lock().map_err(error_message)?.iter().cloned().collect())
}

fn run_process_status(session_id: &str, session: &mut RunProcessSession) -> Result<RunProcessStatus, String> {
    let exit_code = session.child.try_wait().map_err(error_message)?.map(|status| status.code().unwrap_or(-1));
    if let Some(code) = exit_code {
        *session.exit_code.lock().map_err(error_message)? = Some(code);
    }
    let stored_exit_code = *session.exit_code.lock().map_err(error_message)?;
    Ok(RunProcessStatus {
        session_id: session_id.to_string(),
        running: stored_exit_code.is_none(),
        exit_code: stored_exit_code,
        stdout: snapshot_lines(&session.stdout)?,
        stderr: snapshot_lines(&session.stderr)?,
    })
}

#[cfg(target_os = "macos")]
fn open_with_default_app(path: &Path) -> Result<(), String> {
    Command::new("open").arg(path).spawn().map_err(error_message)?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn open_url_with_default_app(url: &str) -> Result<(), String> {
    Command::new("open").arg(url).spawn().map_err(error_message)?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn open_with_default_app(path: &Path) -> Result<(), String> {
    Command::new("cmd")
        .args(["/C", "start", ""])
        .arg(path)
        .spawn()
        .map_err(error_message)?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn open_url_with_default_app(url: &str) -> Result<(), String> {
    Command::new("cmd")
        .args(["/C", "start", ""])
        .arg(url)
        .spawn()
        .map_err(error_message)?;
    Ok(())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn open_with_default_app(path: &Path) -> Result<(), String> {
    Command::new("xdg-open").arg(path).spawn().map_err(error_message)?;
    Ok(())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn open_url_with_default_app(url: &str) -> Result<(), String> {
    Command::new("xdg-open").arg(url).spawn().map_err(error_message)?;
    Ok(())
}
