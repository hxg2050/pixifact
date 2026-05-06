import type { EditorDocument } from '../../../../src';
import { editorDragDataTypes } from './dragPayload';
import { prefabAssetName, prefabFileName, prefabRootKey } from './prefabNaming';

export type ProjectFileKind = 'folder' | 'prefab' | 'script' | 'component' | 'asset' | 'doc' | 'unknown';
export const prefabDragDataType = editorDragDataTypes.prefab;

export interface ProjectFileTreeNode {
    id: string;
    name: string;
    path: string;
    kind: ProjectFileKind;
    depth: number;
    handle: FileSystemHandle;
    children?: ProjectFileTreeNode[];
    detail?: string;
}

interface DirectoryHandleWithEntries extends FileSystemDirectoryHandle {
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
}

interface MutableDirectoryHandle extends DirectoryHandleWithEntries {
    getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
    getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
    removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
}

interface WritableFileHandle extends FileSystemFileHandle {
    createWritable(): Promise<FileSystemWritableFileStream>;
}

interface ReadableFileHandle extends FileSystemFileHandle {
    getFile(): Promise<File>;
}

interface WindowWithDirectoryPicker extends Window {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
}

const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);
const scriptExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const docExtensions = new Set(['.md', '.txt']);
const invalidProjectEntryNamePattern = /[\\/:*?"<>|\u0000-\u001F]/;

export class ProjectFileOperationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ProjectFileOperationError';
    }
}

function extension(name: string) {
    const index = name.lastIndexOf('.');
    return index >= 0 ? name.slice(index).toLowerCase() : '';
}

export function projectFileKind(name: string, path: string): ProjectFileKind {
    const ext = extension(name);
    if (name.endsWith('.prefab')) {
        return 'prefab';
    }
    if (scriptExtensions.has(ext)) {
        return path.includes('/components/') || name.endsWith('Binding.ts')
            ? 'component'
            : 'script';
    }
    if (imageExtensions.has(ext)) {
        return 'asset';
    }
    if (docExtensions.has(ext)) {
        return 'doc';
    }
    return 'unknown';
}

export function componentTypeFromPath(path: string) {
    const name = path.split('/').pop() ?? path;
    const match = name.match(/^(.+)Binding\.tsx?$/);
    return match ? `ui.${match[1]}` : undefined;
}

function sortEntries(left: [string, FileSystemHandle], right: [string, FileSystemHandle]) {
    if (left[1].kind !== right[1].kind) {
        return left[1].kind === 'directory' ? -1 : 1;
    }
    return left[0].localeCompare(right[0]);
}

async function readDirectory(
    handle: FileSystemDirectoryHandle,
    path: string,
    depth: number,
): Promise<ProjectFileTreeNode> {
    const entries: Array<[string, FileSystemHandle]> = [];
    for await (const entry of (handle as DirectoryHandleWithEntries).entries()) {
        entries.push(entry);
    }
    entries.sort(sortEntries);

    const children: ProjectFileTreeNode[] = [];
    for (const [name, childHandle] of entries) {
        const childPath = `${path}/${name}`;
        if (childHandle.kind === 'directory') {
            children.push(await readDirectory(childHandle as FileSystemDirectoryHandle, childPath, depth + 1));
        } else {
            const kind = projectFileKind(name, childPath);
            children.push({
                id: childPath,
                name,
                path: childPath,
                kind,
                depth: depth + 1,
                handle: childHandle,
                detail: kind === 'component' ? componentTypeFromPath(childPath) : undefined,
            });
        }
    }

    return {
        id: path,
        name: handle.name,
        path,
        kind: 'folder',
        depth,
        handle,
        children,
    };
}

export async function readProjectFileTree(handle: FileSystemDirectoryHandle) {
    return readDirectory(handle, handle.name, 0);
}

export async function openProjectFolder() {
    const picker = (window as WindowWithDirectoryPicker).showDirectoryPicker;
    if (!picker) {
        return undefined;
    }
    return readProjectFileTree(await picker.call(window));
}

export function countProjectFileTree(node: ProjectFileTreeNode): number {
    return 1 + (node.children ?? []).reduce((sum, child) => sum + countProjectFileTree(child), 0);
}

export function collectFolderPaths(node: ProjectFileTreeNode): string[] {
    if (node.kind !== 'folder') {
        return [];
    }
    return [
        node.path,
        ...(node.children ?? []).flatMap(collectFolderPaths),
    ];
}

export function projectEntryName(value: string) {
    const name = value.trim();
    if (!name) {
        throw new ProjectFileOperationError('名称不能为空。');
    }
    if (name === '.' || name === '..') {
        throw new ProjectFileOperationError('名称不能是 . 或 ..。');
    }
    if (invalidProjectEntryNamePattern.test(name)) {
        throw new ProjectFileOperationError('名称不能包含 / \\ : * ? " < > | 等字符。');
    }
    return name;
}

export function parentPath(path: string) {
    const parts = path.split('/');
    parts.pop();
    return parts.join('/');
}

export function findParentDirectory(
    projectTree: ProjectFileTreeNode,
    file: ProjectFileTreeNode,
): ProjectFileTreeNode | undefined {
    if (file.path === projectTree.path) {
        return undefined;
    }
    return findFileByPath(projectTree, parentPath(file.path));
}

export function containingDirectory(
    projectTree: ProjectFileTreeNode,
    file?: ProjectFileTreeNode,
): ProjectFileTreeNode | undefined {
    if (!file) {
        return undefined;
    }
    if (file.kind === 'folder') {
        return file;
    }
    return findParentDirectory(projectTree, file);
}

export function nearestExistingPath(projectTree: ProjectFileTreeNode, path?: string) {
    if (!path) {
        return projectTree.path;
    }
    let candidate = path;
    while (candidate) {
        if (findFileByPath(projectTree, candidate)) {
            return candidate;
        }
        candidate = parentPath(candidate);
    }
    return projectTree.path;
}

export function mergeExpandedFolderPaths(
    projectTree: ProjectFileTreeNode,
    previousPaths: readonly string[],
    extraPaths: readonly string[] = [],
) {
    const folders = new Set(collectFolderPaths(projectTree));
    const next = new Set<string>([projectTree.path]);
    for (const path of previousPaths) {
        if (folders.has(path)) {
            next.add(path);
        }
    }
    for (const path of extraPaths) {
        if (folders.has(path)) {
            next.add(path);
        }
    }
    return [...next];
}

export function createBlankPrefab(name: string) {
    const assetName = prefabAssetName(name);
    return {
        version: 1,
        type: 'prefab' as const,
        name: assetName,
        root: {
            type: 'Group' as const,
            name: assetName,
            key: prefabRootKey(assetName),
            transform: {
                width: 320,
                height: 180,
            },
            children: [],
        },
    };
}

export async function createPrefabFile(directory: ProjectFileTreeNode, name: string) {
    const fileName = prefabFileName(name);
    if (!fileName || fileName === '.prefab') {
        throw new ProjectFileOperationError('Prefab 名称不能为空。');
    }
    if (directory.children?.some((child) => child.name === fileName)) {
        throw new ProjectFileOperationError(`已存在 ${fileName}。`);
    }

    const directoryHandle = directory.handle as FileSystemDirectoryHandle;
    const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true }) as WritableFileHandle;
    const writable = await fileHandle.createWritable();
    const content = JSON.stringify(createBlankPrefab(name), null, 2);
    await writable.write(content);
    await writable.close();

    return {
        fileName,
        path: `${directory.path}/${fileName}`,
        content,
    };
}

export async function createFolder(directory: ProjectFileTreeNode, name: string) {
    if (directory.kind !== 'folder') {
        throw new ProjectFileOperationError('只能在目录下新建文件夹。');
    }

    const folderName = projectEntryName(name);
    if (directory.children?.some((child) => child.name === folderName)) {
        throw new ProjectFileOperationError(`已存在 ${folderName}。`);
    }

    const directoryHandle = directory.handle as MutableDirectoryHandle;
    await directoryHandle.getDirectoryHandle(folderName, { create: true });
    return {
        name: folderName,
        path: `${directory.path}/${folderName}`,
    };
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

export async function deleteProjectEntry(
    projectTree: ProjectFileTreeNode,
    target: ProjectFileTreeNode,
    options: { recursive?: boolean } = {},
) {
    if (target.path === projectTree.path) {
        throw new ProjectFileOperationError('不能删除项目根目录。');
    }
    if (target.kind === 'folder' && target.children?.length && !options.recursive) {
        throw new ProjectFileOperationError('目录非空，当前只允许删除空目录。');
    }

    const parent = findParentDirectory(projectTree, target);
    if (!parent || parent.kind !== 'folder') {
        throw new ProjectFileOperationError('找不到父目录。');
    }

    const parentHandle = parent.handle as MutableDirectoryHandle;
    await parentHandle.removeEntry(target.name, { recursive: options.recursive ?? false });
}

export async function renameProjectEntry(
    projectTree: ProjectFileTreeNode,
    target: ProjectFileTreeNode,
    name: string,
) {
    if (target.path === projectTree.path) {
        throw new ProjectFileOperationError('不能重命名项目根目录。');
    }

    const nextName = projectEntryName(name);
    if (nextName === target.name) {
        return {
            name: target.name,
            path: target.path,
        };
    }

    const parent = findParentDirectory(projectTree, target);
    if (!parent || parent.kind !== 'folder') {
        throw new ProjectFileOperationError('找不到父目录。');
    }
    if (parent.children?.some((child) => child.name === nextName)) {
        throw new ProjectFileOperationError(`已存在 ${nextName}。`);
    }

    const parentHandle = parent.handle as MutableDirectoryHandle;
    if (target.kind === 'folder') {
        if (target.children?.length) {
            throw new ProjectFileOperationError('当前只支持重命名空目录。');
        }
        await parentHandle.getDirectoryHandle(nextName, { create: true });
        await parentHandle.removeEntry(target.name);
    } else {
        const sourceHandle = target.handle as ReadableFileHandle;
        const file = await sourceHandle.getFile();
        const nextHandle = await parentHandle.getFileHandle(nextName, { create: true }) as WritableFileHandle;
        const writable = await nextHandle.createWritable();
        await writable.write(await file.arrayBuffer());
        await writable.close();
        await parentHandle.removeEntry(target.name);
    }

    return {
        name: nextName,
        path: `${parent.path}/${nextName}`,
    };
}

export async function savePrefabFile(projectTree: ProjectFileTreeNode, path: string, document: EditorDocument) {
    const file = findFileByPath(projectTree, path);
    const handle = file?.handle as WritableFileHandle | undefined;
    if (!handle) {
        return false;
    }

    const writable = await handle.createWritable();
    await writable.write(document.serialize());
    await writable.close();
    document.dirty = false;
    return true;
}
