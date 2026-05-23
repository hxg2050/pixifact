import type { SceneDocument } from 'pixifact';
import { parseSceneTemplate } from '../../../../packages/pixifact/src/compiler/templateParser';
import type {
    SceneScriptInterface,
    SceneTemplateNode,
} from '../../../../packages/pixifact/src/compiler/spec';
import { loadCompilerSceneDocument } from '../document/compilerSceneDocumentController';
import { editorDragDataTypes } from './dragPayload';
import {
    createHostProjectDirectory,
    createHostProjectFile,
    deleteHostProjectEntry,
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
export type {
    SceneScriptInterface as CompilerSceneScriptInterface,
    SceneTemplateNode as CompilerSceneTemplateNode,
};

export interface ProjectFileTreeNode {
    id: string;
    name: string;
    path: string;
    kind: ProjectFileKind;
    depth: number;
    systemPath?: string;
    projectRootPath?: string;
    children?: ProjectFileTreeNode[];
    detail?: string;
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

export async function openProjectFolder() {
    const tree = await pickHostProjectFolder();
    return tree ? projectFileTreeFromHost(tree) : undefined;
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
    await createHostProjectFile(ensureProjectRootPath(directory), directory.path, fileName, content);

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

    await createHostProjectDirectory(ensureProjectRootPath(directory), directory.path, folderName);
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

    await deleteHostProjectEntry(ensureProjectRootPath(projectTree), target.path, options.recursive ?? false);
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

    await renameHostProjectEntry(ensureProjectRootPath(projectTree), target.path, nextName);

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

    await writeHostProjectFileText(ensureProjectRootPath(projectTree), file.path, document.serialize());
    document.dirty = false;
    return true;
}

function documentRootLocator(document: SceneDocument) {
    const root = document.scene.root;
    return root.key ?? root.id ?? root.name ?? 'root';
}

export async function openSceneFile(
    projectTree: ProjectFileTreeNode,
    file: ProjectFileTreeNode,
    document: SceneDocument,
) {
    const content = await readProjectFileText(projectTree, file);
    document.load(content);
    document.setSelection({ type: 'node', node: documentRootLocator(document) });
    return {
        openedScenePath: file.path,
        scene: document.scene,
        selection: document.selection,
    };
}

export async function openCompilerSceneFile(
    projectTree: ProjectFileTreeNode,
    file: ProjectFileTreeNode,
) {
    const content = await readProjectFileText(projectTree, file);
    const template = parseSceneTemplate(content);
    const descriptor = await readCompilerSceneDescriptor(projectTree, file);
    loadCompilerSceneDocument({
        scenePath: file.path,
        template,
        descriptor,
    });

    return {
        openedScenePath: file.path,
        template,
        descriptor,
    };
}

export async function createAndOpenSceneFile(
    projectTree: ProjectFileTreeNode,
    directory: ProjectFileTreeNode,
    name: string,
    document: SceneDocument,
) {
    const created = await createSceneFile(directory, name);
    const refreshedTree = await refreshProjectFileTree(projectTree);
    document.load(created.content);
    document.setSelection({ type: 'node', node: documentRootLocator(document) });

    return {
        created,
        refreshedTree,
        openedScenePath: created.path,
        scene: document.scene,
        selection: document.selection,
    };
}

export async function saveOpenedSceneFile(
    projectTree: ProjectFileTreeNode,
    openedScenePath: string | undefined,
    document: SceneDocument,
) {
    if (!openedScenePath) {
        return false;
    }
    return saveSceneFile(projectTree, openedScenePath, document);
}

export async function refreshProjectFileTree(projectTree: ProjectFileTreeNode) {
    return projectFileTreeFromHost(await readHostProjectFileTree(ensureProjectRootPath(projectTree)));
}

export async function readProjectFileText(projectTree: ProjectFileTreeNode, file: ProjectFileTreeNode) {
    return readHostProjectFileText(ensureProjectRootPath(projectTree), file.path);
}

async function readCompilerSceneDescriptor(projectTree: ProjectFileTreeNode, file: ProjectFileTreeNode) {
    const generatedFile = findFileByPath(projectTree, compilerSceneDescriptorPath(projectTree, file));
    if (!generatedFile) {
        return undefined;
    }
    return JSON.parse(await readProjectFileText(projectTree, generatedFile)) as SceneScriptInterface;
}

function compilerSceneDescriptorPath(projectTree: ProjectFileTreeNode, file: ProjectFileTreeNode) {
    const sceneName = file.name.replace(/\.scene$/, '');
    return `${projectTree.path}/src/generated/${sceneName}.scene.interface.json`;
}

export async function readProjectFileBytes(projectTree: ProjectFileTreeNode, file: ProjectFileTreeNode) {
    return readHostProjectFileBytes(ensureProjectRootPath(projectTree), file.path);
}

export async function openProjectCodeFile(projectTree: ProjectFileTreeNode, file: ProjectFileTreeNode) {
    await openHostCodeFile(ensureProjectRootPath(projectTree), projectFileRelativePath(projectTree, file));
}

export async function openProjectDefaultFile(projectTree: ProjectFileTreeNode, file: ProjectFileTreeNode) {
    await openHostDefaultFile(ensureProjectRootPath(projectTree), projectFileRelativePath(projectTree, file));
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
