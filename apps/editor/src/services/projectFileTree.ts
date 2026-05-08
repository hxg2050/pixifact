import type { SceneDocument } from 'pixifact';
import { editorDragDataTypes } from './dragPayload';
import {
    createHostProjectDirectory,
    createHostProjectFile,
    deleteHostProjectEntry,
    isDesktopHost,
    openHostCodeFile,
    openHostDefaultFile,
    pickHostProjectFolder,
    readHostProjectFileBytes,
    readHostProjectFileText,
    readHostProjectFileTree,
    renameHostProjectEntry,
    writeHostProjectFileText,
} from './hostBridge';
import type { HostProjectFileTreeNode } from './hostBridge';
import { sceneAssetName, sceneFileName, sceneRootKey } from './sceneNaming';

export type ProjectFileKind = 'folder' | 'scene' | 'script' | 'component' | 'asset' | 'doc' | 'unknown';
export const sceneDragDataType = editorDragDataTypes.scene;

export interface ProjectFileTreeNode {
    id: string;
    name: string;
    path: string;
    kind: ProjectFileKind;
    depth: number;
    handle?: FileSystemHandle;
    systemPath?: string;
    projectRootPath?: string;
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

function ensureBrowserHandle<T extends FileSystemHandle>(file: ProjectFileTreeNode) {
    if (!file.handle) {
        throw new ProjectFileOperationError('当前条目缺少浏览器文件句柄，请使用桌面版重新打开项目。');
    }
    return file.handle as T;
}

function ensureProjectRootPath(projectTree: ProjectFileTreeNode) {
    const path = projectTree.projectRootPath ?? projectTree.systemPath;
    if (!path) {
        throw new ProjectFileOperationError('当前项目缺少本机路径，请使用桌面版重新打开项目。');
    }
    return path;
}

function extension(name: string) {
    const index = name.lastIndexOf('.');
    return index >= 0 ? name.slice(index).toLowerCase() : '';
}

export function projectFileKind(name: string, path: string): ProjectFileKind {
    const ext = extension(name);
    if (name.endsWith('.scene')) {
        return 'scene';
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
    if (isDesktopHost()) {
        const tree = await pickHostProjectFolder();
        return tree ? projectFileTreeFromHost(tree) : undefined;
    }

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

export function projectFileRelativePath(projectTree: ProjectFileTreeNode, file: ProjectFileTreeNode) {
    if (file.path === projectTree.path) {
        return '';
    }
    return file.path.slice(projectTree.path.length + 1);
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

export function createBlankScene(name: string) {
    const assetName = sceneAssetName(name);
    return {
        version: 1,
        type: 'scene' as const,
        name: assetName,
        root: {
            kind: 'container' as const,
            name: assetName,
            key: sceneRootKey(assetName),
            transform: {
                width: 320,
                height: 180,
            },
            children: [],
        },
    };
}

export async function createSceneFile(directory: ProjectFileTreeNode, name: string) {
    const fileName = sceneFileName(name);
    if (!fileName || fileName === '.scene') {
        throw new ProjectFileOperationError('Scene 名称不能为空。');
    }
    if (directory.children?.some((child) => child.name === fileName)) {
        throw new ProjectFileOperationError(`已存在 ${fileName}。`);
    }

    const content = JSON.stringify(createBlankScene(name), null, 2);
    if (directory.systemPath) {
        await createHostProjectFile(ensureProjectRootPath(directory), directory.path, fileName, content);
    } else {
        const directoryHandle = ensureBrowserHandle<FileSystemDirectoryHandle>(directory);
        const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true }) as WritableFileHandle;
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
    }

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

    if (directory.systemPath) {
        await createHostProjectDirectory(ensureProjectRootPath(directory), directory.path, folderName);
    } else {
        const directoryHandle = ensureBrowserHandle<MutableDirectoryHandle>(directory);
        await directoryHandle.getDirectoryHandle(folderName, { create: true });
    }
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

    if (projectTree.systemPath) {
        await deleteHostProjectEntry(ensureProjectRootPath(projectTree), target.path, options.recursive ?? false);
    } else {
        const parentHandle = ensureBrowserHandle<MutableDirectoryHandle>(parent);
        await parentHandle.removeEntry(target.name, { recursive: options.recursive ?? false });
    }
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

    if (projectTree.systemPath) {
        await renameHostProjectEntry(ensureProjectRootPath(projectTree), target.path, nextName);
    } else {
        const parentHandle = ensureBrowserHandle<MutableDirectoryHandle>(parent);
        if (target.kind === 'folder') {
            if (target.children?.length) {
                throw new ProjectFileOperationError('当前只支持重命名空目录。');
            }
            await parentHandle.getDirectoryHandle(nextName, { create: true });
            await parentHandle.removeEntry(target.name);
        } else {
            const sourceHandle = ensureBrowserHandle<ReadableFileHandle>(target);
            const file = await sourceHandle.getFile();
            const nextHandle = await parentHandle.getFileHandle(nextName, { create: true }) as WritableFileHandle;
            const writable = await nextHandle.createWritable();
            await writable.write(await file.arrayBuffer());
            await writable.close();
            await parentHandle.removeEntry(target.name);
        }
    }

    return {
        name: nextName,
        path: `${parent.path}/${nextName}`,
    };
}

export async function saveSceneFile(projectTree: ProjectFileTreeNode, path: string, document: SceneDocument) {
    const file = findFileByPath(projectTree, path);
    if (!file) {
        return false;
    }

    if (projectTree.systemPath) {
        await writeHostProjectFileText(ensureProjectRootPath(projectTree), file.path, document.serialize());
    } else {
        const handle = file.handle as WritableFileHandle | undefined;
        if (!handle) {
            return false;
        }
        const writable = await handle.createWritable();
        await writable.write(document.serialize());
        await writable.close();
    }
    document.dirty = false;
    return true;
}

export async function refreshProjectFileTree(projectTree: ProjectFileTreeNode) {
    if (projectTree.systemPath) {
        return projectFileTreeFromHost(await readHostProjectFileTree(ensureProjectRootPath(projectTree)));
    }
    return readProjectFileTree(ensureBrowserHandle<FileSystemDirectoryHandle>(projectTree));
}

export async function readProjectFileText(projectTree: ProjectFileTreeNode, file: ProjectFileTreeNode) {
    if (projectTree.systemPath) {
        return readHostProjectFileText(ensureProjectRootPath(projectTree), file.path);
    }
    const handle = ensureBrowserHandle<FileSystemFileHandle>(file);
    return (await handle.getFile()).text();
}

export async function readProjectFileBytes(projectTree: ProjectFileTreeNode, file: ProjectFileTreeNode) {
    if (projectTree.systemPath) {
        return readHostProjectFileBytes(ensureProjectRootPath(projectTree), file.path);
    }
    const handle = ensureBrowserHandle<FileSystemFileHandle>(file);
    return new Uint8Array(await (await handle.getFile()).arrayBuffer());
}

export async function openProjectCodeFile(projectTree: ProjectFileTreeNode, file: ProjectFileTreeNode) {
    await openHostCodeFile(ensureProjectRootPath(projectTree), file.path);
}

export async function openProjectDefaultFile(projectTree: ProjectFileTreeNode, file: ProjectFileTreeNode) {
    await openHostDefaultFile(ensureProjectRootPath(projectTree), file.path);
}

function projectFileTreeFromHost(
    node: HostProjectFileTreeNode,
    projectRootPath = node.systemPath,
): ProjectFileTreeNode {
    const kind = node.kind as ProjectFileKind;
    return {
        id: node.id,
        name: node.name,
        path: node.path,
        kind,
        depth: node.depth,
        systemPath: node.systemPath,
        projectRootPath,
        children: node.children?.map((child) => projectFileTreeFromHost(child, projectRootPath)),
        detail: node.detail,
    };
}
