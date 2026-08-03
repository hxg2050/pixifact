import type { ProjectFileTreeNode, ProjectFileKind } from './projectFileTree';
import type { SceneScriptInterface } from 'pixifact/compiler';
import type { EditorSelectionContext } from './editorContext';

const editorSessionProtocolVersion = 1;

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

export interface EditorSceneFile {
    path: string;
    source: string;
    version: string;
}

export interface EditorBrowserContext {
    scene: {
        path: string;
        revision: string;
        syncState: 'synced' | 'saving' | 'conflict' | 'error';
    };
    selection: EditorSelectionContext;
}

export type EditorSessionConnection =
    | {
        status: 'accepted';
        close(): void;
        publishContext(context: EditorBrowserContext): void;
    }
    | {
        status: 'occupied';
        close(): void;
    };

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
) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/events`);
    return new Promise<EditorSessionConnection>((resolve, reject) => {
        let connected = false;
        let settled = false;
        socket.addEventListener('message', (event) => {
            const message = JSON.parse(String(event.data)) as {
                type?: string;
                path?: string;
                protocolVersion?: number;
            };
            if (message.protocolVersion !== undefined && message.protocolVersion !== editorSessionProtocolVersion) {
                socket.close();
                reject(new Error('Editor session protocol version does not match. Restart Pixifact Editor.'));
                return;
            }
            if (message.type === 'editorSessionAccepted') {
                connected = true;
                settled = true;
                resolve({
                    status: 'accepted',
                    close: () => socket.close(),
                    publishContext(context) {
                        if (socket.readyState !== WebSocket.OPEN) return;
                        socket.send(JSON.stringify({
                            type: 'editorContextChanged',
                            protocolVersion: editorSessionProtocolVersion,
                            context,
                        }));
                    },
                });
                return;
            }
            if (message.type === 'editorSessionOccupied') {
                settled = true;
                resolve({ status: 'occupied', close: () => socket.close() });
                socket.close();
                return;
            }
            if (message.type === 'projectFileChanged' && message.path) {
                onProjectFileChanged(message.path);
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
