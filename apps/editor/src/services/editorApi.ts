import type { ProjectFileTreeNode, ProjectFileKind } from './projectFileTree';
import type { SceneScriptInterface } from 'pixifact/compiler';
import type { EditorSelectionContext } from './editorContext';

const editorSessionProtocolVersion = 3;

export interface EditorProjectFile {
    kind: 'image' | 'scene' | 'script' | 'file';
    path: string;
}

export interface EditorProject {
    files: EditorProjectFile[];
    images: string[];
    name: string;
    root: string;
    scenes: string[];
}

export interface EditorUiState {
    assetTreeExpandedDirectories?: string[];
}

export interface EditorSceneFile {
    path: string;
    source: string;
    version: string;
}

export interface EditorBrowserContext {
    scene: {
        path: string;
        previewState: 'loading' | 'ready' | 'error';
        revision: string;
        syncState: 'synced' | 'saving' | 'conflict' | 'error';
    };
    selection: EditorSelectionContext;
}

export interface EditorSessionResumeState {
    scenePath: string;
    selectedLocator?: string;
}

export interface EditorSessionState {
    error?: string;
    reason?: 'takenOver';
    resume?: EditorSessionResumeState;
    status: 'active' | 'standby';
}

export interface EditorSessionConnection {
    initialState: EditorSessionState;
    close(): void;
    publishContext(context: EditorBrowserContext): void;
    requestTakeover(): void;
}

export interface EditorScreenshotRequest {
    path: string;
    revision: string;
}

export interface EditorScreenshotCapture {
    width: number;
    height: number;
    dataUrl: string;
}

export class EditorApiError extends Error {
    constructor(readonly status: number, message: string) {
        super(message);
    }
}

async function checkedResponse(response: Response) {
    if (response.ok) {
        return response;
    }
    const body = await response.json() as { error?: string };
    throw new EditorApiError(response.status, body.error ?? `Editor request failed with ${response.status}.`);
}

export async function readEditorProject() {
    const response = await checkedResponse(await fetch('/api/project'));
    return response.json() as Promise<EditorProject>;
}

export async function readEditorUiState() {
    const response = await checkedResponse(await fetch('/api/editor-ui-state'));
    return response.json() as Promise<EditorUiState>;
}

export async function writeEditorUiState(assetTreeExpandedDirectories: readonly string[]) {
    const response = await checkedResponse(await fetch('/api/editor-ui-state', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assetTreeExpandedDirectories }),
    }));
    return response.json() as Promise<EditorUiState>;
}

export async function readEditorScene(path: string) {
    const response = await checkedResponse(await fetch(`/api/scene?path=${encodeURIComponent(path)}`));
    return response.json() as Promise<EditorSceneFile>;
}

export async function readEditorSceneBindings() {
    const response = await checkedResponse(await fetch('/api/scene-bindings'));
    return response.json() as Promise<Record<string, SceneScriptInterface>>;
}

export async function writeEditorScene(path: string, source: string, expectedVersion: string) {
    const response = await checkedResponse(await fetch(`/api/scene?path=${encodeURIComponent(path)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source, expectedVersion }),
    }));
    return response.json() as Promise<{ path: string; version: string }>;
}

export async function readEditorProjectFile(path: string) {
    return checkedResponse(await fetch(`/api/file?path=${encodeURIComponent(path)}`));
}

export function connectEditorSession(
    onProjectFileChanged: (path: string) => void,
    onDisconnected: () => void,
    onStateChanged: (state: EditorSessionState) => void,
    onScreenshotRequested: (request: EditorScreenshotRequest) => Promise<EditorScreenshotCapture>,
) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/events`);
    return new Promise<EditorSessionConnection>((resolve, reject) => {
        let active = false;
        let connected = false;
        let settled = false;
        const connection = (initialState: EditorSessionState): EditorSessionConnection => ({
            initialState,
            close: () => socket.close(),
            publishContext(context) {
                if (!active || socket.readyState !== WebSocket.OPEN) return;
                socket.send(JSON.stringify({
                    type: 'editorContextChanged',
                    protocolVersion: editorSessionProtocolVersion,
                    context,
                }));
            },
            requestTakeover() {
                if (active || socket.readyState !== WebSocket.OPEN) return;
                socket.send(JSON.stringify({
                    type: 'editorSessionTakeoverRequested',
                    protocolVersion: editorSessionProtocolVersion,
                }));
            },
        });
        socket.addEventListener('message', (event) => {
            const message = JSON.parse(String(event.data)) as {
                error?: string;
                type?: string;
                path?: string;
                protocolVersion?: number;
                reason?: 'takenOver';
                resume?: EditorSessionResumeState;
                requestId?: string;
                scene?: EditorScreenshotRequest;
            };
            if (message.protocolVersion !== undefined && message.protocolVersion !== editorSessionProtocolVersion) {
                socket.close();
                reject(new Error('Editor session protocol version does not match. Restart Pixifact Editor.'));
                return;
            }
            if (message.type === 'editorSessionActive' || message.type === 'editorSessionStandby') {
                const state: EditorSessionState = {
                    status: message.type === 'editorSessionActive' ? 'active' : 'standby',
                    ...(message.resume ? { resume: message.resume } : {}),
                    ...(message.reason ? { reason: message.reason } : {}),
                    ...(message.error ? { error: message.error } : {}),
                };
                active = state.status === 'active';
                connected = true;
                if (!settled) {
                    settled = true;
                    resolve(connection(state));
                } else {
                    onStateChanged(state);
                }
                return;
            }
            if (active && message.type === 'projectFileChanged' && message.path) {
                onProjectFileChanged(message.path);
                return;
            }
            if (
                active
                && message.type === 'editorScreenshotRequested'
                && message.requestId
                && message.scene
            ) {
                void onScreenshotRequested(message.scene).then((capture) => {
                    if (!active || socket.readyState !== WebSocket.OPEN) return;
                    socket.send(JSON.stringify({
                        type: 'editorScreenshotCompleted',
                        protocolVersion: editorSessionProtocolVersion,
                        requestId: message.requestId,
                        scene: message.scene,
                        ...capture,
                    }));
                }).catch((error) => {
                    if (!active || socket.readyState !== WebSocket.OPEN) return;
                    socket.send(JSON.stringify({
                        type: 'editorScreenshotFailed',
                        protocolVersion: editorSessionProtocolVersion,
                        requestId: message.requestId,
                        error: error instanceof Error ? error.message : String(error),
                    }));
                });
            }
        });
        socket.addEventListener('error', () => {
            if (!settled) {
                settled = true;
                reject(new Error('Editor 无法连接本地项目服务。'));
            }
        });
        socket.addEventListener('close', () => {
            if (!settled) {
                settled = true;
                reject(new Error('Editor 本地项目服务连接已关闭。'));
            } else if (connected) {
                onDisconnected();
            }
        });
    });
}

function projectFileKind(kind: EditorProjectFile['kind']): ProjectFileKind {
    if (kind === 'image') {
        return 'asset';
    }
    if (kind === 'file') {
        return 'unknown';
    }
    return kind;
}

export function createEditorProjectTree(project: EditorProject): ProjectFileTreeNode {
    const root: ProjectFileTreeNode = {
        id: project.name,
        name: project.name,
        path: project.name,
        kind: 'folder',
        depth: 0,
        children: [],
    };
    const folders = new Map<string, ProjectFileTreeNode>([[root.path, root]]);

    for (const file of project.files) {
        const segments = file.path.split('/');
        let parent = root;
        let currentPath = root.path;
        for (const [index, segment] of segments.entries()) {
            currentPath = `${currentPath}/${segment}`;
            const isFile = index === segments.length - 1;
            if (isFile) {
                parent.children!.push({
                    id: currentPath,
                    name: segment,
                    path: currentPath,
                    kind: projectFileKind(file.kind),
                    depth: index + 1,
                });
                continue;
            }
            let folder = folders.get(currentPath);
            if (!folder) {
                folder = {
                    id: currentPath,
                    name: segment,
                    path: currentPath,
                    kind: 'folder',
                    depth: index + 1,
                    children: [],
                };
                folders.set(currentPath, folder);
                parent.children!.push(folder);
            }
            parent = folder;
        }
    }

    return root;
}

export const editorSceneFileApi = {
    readScene: readEditorScene,
    writeScene: writeEditorScene,
};
