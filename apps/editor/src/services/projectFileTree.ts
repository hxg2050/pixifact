import { readEditorProjectFile } from './editorApi';

export type ProjectFileKind = 'folder' | 'scene' | 'script' | 'asset' | 'unknown';

export interface ProjectFileTreeNode {
    id: string;
    name: string;
    path: string;
    kind: ProjectFileKind;
    depth: number;
    children?: ProjectFileTreeNode[];
}

export function findFileByPath(node: ProjectFileTreeNode, path: string): ProjectFileTreeNode | undefined {
    if (node.path === path) {
        return node;
    }
    for (const child of node.children ?? []) {
        const match = findFileByPath(child, path);
        if (match) {
            return match;
        }
    }
    return undefined;
}

export function projectFileRelativePath(projectTree: ProjectFileTreeNode, file: ProjectFileTreeNode) {
    if (file.path === projectTree.path) {
        return '';
    }
    return file.path.slice(projectTree.path.length + 1);
}

export async function readProjectFileText(projectTree: ProjectFileTreeNode, file: ProjectFileTreeNode) {
    const response = await readEditorProjectFile(projectFileRelativePath(projectTree, file));
    return response.text();
}

export async function readProjectFileBytes(projectTree: ProjectFileTreeNode, file: ProjectFileTreeNode) {
    const response = await readEditorProjectFile(projectFileRelativePath(projectTree, file));
    return new Uint8Array(await response.arrayBuffer());
}
