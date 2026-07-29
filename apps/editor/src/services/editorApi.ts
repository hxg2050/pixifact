import type { ProjectFileTreeNode, ProjectFileKind } from './projectFileTree';

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

export function watchEditorProject(handler: (path: string) => void) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/events`);
    socket.addEventListener('message', (event) => {
        const message = JSON.parse(String(event.data)) as { type?: string; path?: string };
        if (message.type === 'projectFileChanged' && message.path) {
            handler(message.path);
        }
    });
    return () => socket.close();
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
        systemPath: project.root,
        projectRootPath: project.root,
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
                    systemPath: `${project.root}/${file.path}`,
                    projectRootPath: project.root,
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
                    systemPath: `${project.root}/${segments.slice(0, index + 1).join('/')}`,
                    projectRootPath: project.root,
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
