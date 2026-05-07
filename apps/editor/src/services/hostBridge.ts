export interface HostProjectFileTreeNode {
    id: string;
    name: string;
    path: string;
    kind: string;
    depth: number;
    systemPath: string;
    children?: HostProjectFileTreeNode[];
    detail?: string;
}

interface TauriCore {
    invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

interface WindowWithTauri extends Window {
    __TAURI__?: {
        core?: TauriCore;
    };
}

function tauriCore() {
    return (window as WindowWithTauri).__TAURI__?.core;
}

export function isDesktopHost() {
    return tauriCore() !== undefined;
}

export async function invokeHost<T>(command: string, args?: Record<string, unknown>) {
    const core = tauriCore();
    if (!core) {
        throw new Error('当前浏览器预览不支持本机文件系统能力，请使用桌面版。');
    }
    return core.invoke<T>(command, args);
}

export function hostErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

export async function pickHostProjectFolder() {
    const tree = await invokeHost<HostProjectFileTreeNode | null>('pick_project_folder');
    return tree ?? undefined;
}

export async function readHostProjectFileTree(projectRootPath: string) {
    return invokeHost<HostProjectFileTreeNode>('read_project_file_tree', { projectRootPath });
}

export async function readHostProjectFileText(projectRootPath: string, filePath: string) {
    return invokeHost<string>('read_project_file_text', { projectRootPath, filePath });
}

export async function readHostProjectFileBytes(projectRootPath: string, filePath: string) {
    const bytes = await invokeHost<number[] | ArrayBuffer | Uint8Array>('read_project_file_bytes', {
        projectRootPath,
        filePath,
    });
    if (bytes instanceof Uint8Array) {
        return bytes;
    }
    if (bytes instanceof ArrayBuffer) {
        return new Uint8Array(bytes);
    }
    return new Uint8Array(bytes);
}

export async function writeHostProjectFileText(projectRootPath: string, filePath: string, content: string) {
    await invokeHost<void>('write_project_file_text', { projectRootPath, filePath, content });
}

export async function createHostProjectFile(
    projectRootPath: string,
    directoryPath: string,
    fileName: string,
    content: string,
) {
    return invokeHost<string>('create_project_file', {
        projectRootPath,
        directoryPath,
        fileName,
        content,
    });
}

export async function createHostProjectDirectory(projectRootPath: string, directoryPath: string, name: string) {
    return invokeHost<string>('create_project_directory', {
        projectRootPath,
        directoryPath,
        name,
    });
}

export async function deleteHostProjectEntry(projectRootPath: string, filePath: string, recursive: boolean) {
    await invokeHost<void>('delete_project_entry', { projectRootPath, filePath, recursive });
}

export async function renameHostProjectEntry(projectRootPath: string, filePath: string, name: string) {
    return invokeHost<string>('rename_project_entry', { projectRootPath, filePath, name });
}

export async function openHostCodeFile(projectRootPath: string, filePath: string) {
    await invokeHost<void>('open_code_file', { projectRootPath, filePath });
}

export async function openHostDefaultFile(projectRootPath: string, filePath: string) {
    await invokeHost<void>('open_default_file', { projectRootPath, filePath });
}
