import type { SceneDocument } from 'pixifact';
import { serializeSceneTemplate } from '../../../../packages/pixifact/src/compiler/templateSerializer';
import type {
    SceneScriptInterface,
    SceneTemplate,
    SceneTemplateInterface,
    SceneTemplateNode,
} from '../../../../packages/pixifact/src/compiler/spec';
import {
    loadCompilerSceneDocument,
    markCompilerSceneSaved,
    refreshCompilerSceneBindingSnapshot as refreshCompilerSceneDocumentBindingSnapshot,
} from '../document/compilerSceneDocumentController';
import type { CompilerSceneDocument } from '../document/compilerSceneDocumentController';
import { editorDragDataTypes } from './dragPayload';
import type { EditorDragPayload } from './dragPayload';
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
    watchHostProjectFiles,
    writeHostProjectFileText,
} from './hostBridge';
import type { HostProjectFileTreeNode } from './hostBridge';
import { readCompilerSceneBindingIndex, readCompilerSceneTemplateBinding, sceneInterfacesForCompilerTemplate } from './sceneBindingIndex';
import { sceneAssetName, sceneFileName } from './sceneNaming';

export type ProjectFileKind = 'folder' | 'scene' | 'script' | 'component' | 'asset' | 'doc' | 'unknown';
export const sceneDragDataType = editorDragDataTypes.scene;
export const assetDragDataType = editorDragDataTypes.asset;
export type {
    SceneScriptInterface as CompilerSceneScriptInterface,
    SceneTemplateInterface as CompilerSceneTemplateInterface,
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
    if (!tree) {
        return undefined;
    }
    await watchHostProjectFiles(tree.systemPath);
    return projectFileTreeFromHost(tree);
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

export function assetDragPayload(file: ProjectFileTreeNode): EditorDragPayload | undefined {
    return file.kind === 'asset'
        ? {
            data: file.path,
            label: file.name,
            type: assetDragDataType,
        }
        : undefined;
}

export function resolveProjectAssetReference(projectTree: ProjectFileTreeNode, path: string) {
    const file = findFileByPath(projectTree, path);
    if (!file || file.kind !== 'asset') {
        return {
            ok: false as const,
            error: '拖入的文件不是图片资源。',
        };
    }

    return {
        ok: true as const,
        value: projectFileRelativePath(projectTree, file),
    };
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

export function createBlankCompilerScene(name: string): SceneTemplate {
    const assetName = sceneAssetName(name);
    return {
        version: 2,
        name: assetName,
        script: {
            path: `src/scenes/${assetName}.ts`,
        },
        props: {
            width: 960,
            height: 540,
        },
        interface: {
            props: {},
            events: {},
            slots: {},
        },
        children: [],
    };
}

function createBlankCompilerSceneScript(name: string) {
    const assetName = sceneAssetName(name);
    return [
        "import { Container } from 'pixi.js';",
        "import { scene } from 'pixifact/compiler';",
        '',
        '@scene()',
        `export class ${assetName} extends Container {`,
        '    onMounted() {}',
        '}',
        '',
    ].join('\n');
}

export async function createSceneFile(projectTree: ProjectFileTreeNode, directory: ProjectFileTreeNode, name: string) {
    const fileName = sceneFileName(name);
    const assetName = sceneAssetName(name);
    const scriptFileName = `${assetName}.ts`;
    const scriptPath = `${projectTree.path}/src/scenes/${scriptFileName}`;
    if (!fileName || fileName === '.scene') {
        throw new ProjectFileOperationError('Scene 名称不能为空。');
    }
    if (directory.children?.some((child) => child.name === fileName)) {
        throw new ProjectFileOperationError(`已存在 ${fileName}。`);
    }
    if (findFileByPath(projectTree, scriptPath)) {
        throw new ProjectFileOperationError(`已存在 ${scriptFileName}。`);
    }

    const projectRootPath = ensureProjectRootPath(projectTree);
    const content = serializeSceneTemplate(createBlankCompilerScene(name));
    await ensureProjectDirectoryPath(projectTree, ['src', 'scenes']);
    await createHostProjectFile(projectRootPath, directory.path, fileName, content);
    await createHostProjectFile(projectRootPath, `${projectTree.path}/src/scenes`, scriptFileName, createBlankCompilerSceneScript(name));

    return {
        fileName,
        path: `${directory.path}/${fileName}`,
        content,
        scriptFileName,
        scriptPath,
    };
}

async function ensureProjectDirectoryPath(projectTree: ProjectFileTreeNode, parts: string[]) {
    let current = projectTree;
    let currentPath = projectTree.path;
    for (const part of parts) {
        const existing = current?.children?.find((child) => child.name === part);
        if (existing) {
            current = existing;
            currentPath = existing.path;
            continue;
        }
        await createHostProjectDirectory(ensureProjectRootPath(projectTree), currentPath, part);
        currentPath = `${currentPath}/${part}`;
        current = {
            id: currentPath,
            name: part,
            path: currentPath,
            kind: 'folder',
            depth: current.depth + 1,
            children: [],
        };
    }
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

export async function saveCompilerSceneFile(projectTree: ProjectFileTreeNode, path: string, document: CompilerSceneDocument) {
    const file = findFileByPath(projectTree, path);
    if (!file) {
        return false;
    }

    await writeHostProjectFileText(ensureProjectRootPath(projectTree), file.path, serializeSceneTemplate(document.template));
    markCompilerSceneSaved();
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
    const bindingIndex = await readCompilerSceneBindingIndex(projectTree);
    const binding = bindingIndex[projectFileRelativePath(projectTree, file)];
    if (!binding) {
        throw new ProjectFileOperationError(`Scene ${file.name} 必须绑定脚本。`);
    }
    const template = binding.template;
    const descriptor = binding.descriptor;
    const sceneInterfaces = sceneInterfacesForCompilerTemplate(bindingIndex, template.children);
    loadCompilerSceneDocument({
        scenePath: file.path,
        template,
        descriptor,
        sceneInterfaces,
    });

    return {
        openedScenePath: file.path,
        template,
        descriptor,
        sceneInterfaces,
    };
}

export async function createAndOpenSceneFile(
    projectTree: ProjectFileTreeNode,
    directory: ProjectFileTreeNode,
    name: string,
) {
    const created = await createSceneFile(projectTree, directory, name);
    const refreshedTree = await refreshProjectFileTree(projectTree);
    const createdFile = findFileByPath(refreshedTree, created.path);

    const opened = await openCompilerSceneFile(refreshedTree, createdFile!);
    return {
        created,
        refreshedTree,
        ...opened,
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
    const projectRootPath = ensureProjectRootPath(projectTree);
    await watchHostProjectFiles(projectRootPath);
    return projectFileTreeFromHost(await readHostProjectFileTree(projectRootPath));
}

export async function readProjectFileText(projectTree: ProjectFileTreeNode, file: ProjectFileTreeNode) {
    return readHostProjectFileText(ensureProjectRootPath(projectTree), file.path);
}

export async function refreshCompilerSceneBindingSnapshot(
    projectTree: ProjectFileTreeNode,
    file: ProjectFileTreeNode,
    template: SceneTemplate,
) {
    const binding = await readCompilerSceneTemplateBinding(projectTree, file, template);
    const descriptor = binding.descriptor;
    if (!template.script) {
        throw new ProjectFileOperationError(`Scene ${file.name} 必须绑定脚本。`);
    }
    const bindingIndex = await readCompilerSceneBindingIndex(projectTree);
    const sceneInterfaces = sceneInterfacesForCompilerTemplate(bindingIndex, template.children);
    refreshCompilerSceneDocumentBindingSnapshot({ descriptor, sceneInterfaces });
    return { descriptor, sceneInterfaces };
}

export async function openCompilerSceneScriptFile(
    projectTree: ProjectFileTreeNode,
    template: SceneTemplate,
) {
    if (!template.script) {
        throw new ProjectFileOperationError(`Scene ${template.name} 必须绑定脚本。`);
    }
    const scriptFile = findFileByPath(projectTree, `${projectTree.path}/${template.script.path}`);
    if (!scriptFile) {
        throw new ProjectFileOperationError(`找不到 Scene 脚本 ${template.script.path}。`);
    }
    await openProjectCodeFile(projectTree, scriptFile);
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
