import {
    parsePixifactProjectConfig,
    pixifactProjectConfigFileName,
} from 'pixifact';
import type { PixifactProjectConfig } from 'pixifact';
import type { ProjectFileTreeNode } from './projectFileTree';
import { findFileByPath, projectFileRelativePath, readProjectFileText } from './projectFileTree';
import {
    getHostRunProcessStatus,
    startHostRunProcess,
    stopHostRunProcess,
} from './hostBridge';
import type { HostRunProcessStatus } from './hostBridge';

export type EditorRunState =
    | 'unconfigured'
    | 'ready'
    | 'starting'
    | 'running'
    | 'failed'
    | 'stopped';

export interface EditorRunStatus {
    state: EditorRunState;
    sessionId?: string;
    projectName?: string;
    command?: string;
    error?: string;
    exitCode?: number | null;
    stdout: string[];
    stderr: string[];
}

export class EditorRunServiceError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'EditorRunServiceError';
    }
}

function projectRootPath(projectTree: ProjectFileTreeNode) {
    const root = projectTree.projectRootPath ?? projectTree.systemPath;
    if (!root) {
        throw new EditorRunServiceError('当前项目缺少本机路径，请使用桌面版重新打开项目。');
    }
    return root;
}

function emptyStatus(state: EditorRunState): EditorRunStatus {
    return {
        state,
        stdout: [],
        stderr: [],
    };
}

function summarizeStatus(
    status: HostRunProcessStatus,
    previous: EditorRunStatus,
    state: EditorRunState = status.running ? 'running' : status.exitCode === 0 ? 'stopped' : 'failed',
): EditorRunStatus {
    return {
        ...previous,
        state,
        sessionId: status.sessionId,
        exitCode: status.exitCode,
        stdout: status.stdout,
        stderr: status.stderr,
        error: state === 'failed' ? previous.error ?? status.stderr.at(-1) ?? `运行进程退出：${status.exitCode}` : undefined,
    };
}

export async function readProjectRunConfig(projectTree: ProjectFileTreeNode): Promise<PixifactProjectConfig | undefined> {
    const configPath = `${projectTree.path}/${pixifactProjectConfigFileName}`;
    const configFile = findFileByPath(projectTree, configPath);
    if (!configFile) {
        return undefined;
    }
    const content = await readProjectFileText(projectTree, configFile);
    return parsePixifactProjectConfig(JSON.parse(content));
}

export async function createReadyRunStatus(projectTree: ProjectFileTreeNode): Promise<EditorRunStatus> {
    const config = await readProjectRunConfig(projectTree);
    if (!config?.run) {
        return emptyStatus('unconfigured');
    }
    return {
        ...emptyStatus('ready'),
        projectName: config.name,
        command: [config.run.command, ...config.run.args].join(' '),
    };
}

export async function startEditorRun(projectTree: ProjectFileTreeNode, dirty: boolean): Promise<EditorRunStatus> {
    if (dirty) {
        throw new EditorRunServiceError('当前 Scene 有未保存修改，请先保存后再运行。');
    }
    const config = await readProjectRunConfig(projectTree);
    if (!config?.run) {
        return emptyStatus('unconfigured');
    }
    const rootPath = projectRootPath(projectTree);
    const run = config.run;
    const output = await startHostRunProcess(
        rootPath,
        run.command,
        run.args,
        run.cwd,
        run.url,
    );
    const status = await getHostRunProcessStatus(output.sessionId);
    return summarizeStatus(status, {
        ...emptyStatus('starting'),
        sessionId: output.sessionId,
        projectName: config.name,
        command: [run.command, ...run.args].join(' '),
    }, status.running ? 'running' : status.exitCode === 0 ? 'stopped' : 'failed');
}

export async function refreshEditorRunStatus(status: EditorRunStatus): Promise<EditorRunStatus> {
    if (!status.sessionId) {
        return status;
    }
    return summarizeStatus(await getHostRunProcessStatus(status.sessionId), status);
}

export async function stopEditorRun(status: EditorRunStatus): Promise<EditorRunStatus> {
    if (!status.sessionId) {
        return status;
    }
    const next = await stopHostRunProcess(status.sessionId);
    return summarizeStatus(next, status, 'stopped');
}

export function runConfigRelativePath(projectTree: ProjectFileTreeNode, file: ProjectFileTreeNode) {
    return projectFileRelativePath(projectTree, file);
}
