import {
    builtinSceneInterfaces,
    defaultSceneSourceRoots,
    extractSceneScriptInterface,
    isIgnoredSceneSourceDirectory,
    normalizeSceneAssetId,
    pairedSceneScriptPath,
    parseSceneTemplate,
    resolveSceneReference,
    toPosixPath,
    type SceneScriptInterface,
    type SceneTemplate,
    type SceneTemplateInterface,
    type SceneTemplateNode,
} from 'pixifact/compiler';
import { readHostProjectFileText } from './hostBridge';
import type { ProjectFileTreeNode } from './projectFileTree';

export interface CompilerSceneBinding {
    scenePath: string;
    file: ProjectFileTreeNode;
    scriptFile: ProjectFileTreeNode;
    template: SceneTemplate;
    descriptor: SceneScriptInterface;
    className: string;
    interface: SceneTemplateInterface;
}

export type CompilerSceneBindingIndex = Record<string, CompilerSceneBinding>;

export async function readCompilerSceneBindingIndex(projectTree: ProjectFileTreeNode): Promise<CompilerSceneBindingIndex> {
    const entries: [string, CompilerSceneBinding][] = [];
    for (const file of collectCompilerSceneFiles(projectTree, projectTree)) {
        const binding = await readCompilerSceneBinding(projectTree, file);
        entries.push([binding.scenePath, binding]);
    }
    return Object.fromEntries(entries);
}

export async function readCompilerSceneBinding(
    projectTree: ProjectFileTreeNode,
    file: ProjectFileTreeNode,
): Promise<CompilerSceneBinding> {
    const template = parseSceneTemplate(await readProjectFileText(projectTree, file));
    return readCompilerSceneTemplateBinding(projectTree, file, template);
}

export async function readCompilerSceneTemplateBinding(
    projectTree: ProjectFileTreeNode,
    file: ProjectFileTreeNode,
    template: SceneTemplate,
): Promise<CompilerSceneBinding> {
    const scenePath = projectFileRelativePath(projectTree, file);
    const scriptPath = pairedSceneScriptPath(scenePath);
    const scriptFile = findFileByPath(projectTree, `${projectTree.path}/${scriptPath}`);
    if (!scriptFile) {
        throw new Error(`找不到 Scene 脚本 ${scriptPath}。`);
    }

    const descriptor = extractSceneScriptInterface(
        await readProjectFileText(projectTree, scriptFile),
        scriptFile.path,
        { scene: scenePath },
    );
    if (descriptor.className !== template.name) {
        throw new Error(`Scene ${file.name} 的 name "${template.name}" 必须等于脚本 @scene 类名 "${descriptor.className}"。`);
    }

    const boundTemplate: SceneTemplate = {
        ...template,
        interface: descriptor.interface,
    };

    return {
        scenePath,
        file,
        scriptFile,
        template: boundTemplate,
        descriptor,
        className: descriptor.className,
        interface: descriptor.interface,
    };
}

export function sceneInterfacesForCompilerTemplate(
    index: CompilerSceneBindingIndex,
    nodes: readonly SceneTemplateNode[],
    ownerScenePath?: string,
) {
    return {
        ...builtinSceneInterfaces(),
        ...Object.fromEntries([...collectSceneInstancePaths(nodes, new Set(), ownerScenePath)]
            .filter((scenePath) => index[scenePath])
            .map((scenePath) => [scenePath, index[scenePath].interface])),
    };
}

function collectCompilerSceneFiles(
    projectTree: ProjectFileTreeNode,
    node: ProjectFileTreeNode,
    files: ProjectFileTreeNode[] = [],
) {
    if (node.kind === 'scene') {
        if (isCompilerSceneSourcePath(projectFileRelativePath(projectTree, node))) {
            files.push(node);
        }
        return files;
    }
    if (node.kind === 'folder' && isIgnoredSceneSourceDirectory(node.name)) {
        return files;
    }
    for (const child of node.children ?? []) {
        collectCompilerSceneFiles(projectTree, child, files);
    }
    return files;
}

function isCompilerSceneSourcePath(scenePath: string) {
    let normalized: string;
    try {
        normalized = normalizeSceneAssetId(scenePath);
    } catch {
        return false;
    }
    if (toPosixPath(normalized).split('/').some(isIgnoredSceneSourceDirectory)) {
        return false;
    }
    return defaultSceneSourceRoots.some((sourceRoot) => normalized.startsWith(`${sourceRoot}/`));
}

function collectSceneInstancePaths(
    nodes: readonly SceneTemplateNode[],
    paths = new Set<string>(),
    ownerScenePath?: string,
) {
    for (const node of nodes) {
        if (node.kind === 'pixi') {
            collectSceneInstancePaths(node.children, paths, ownerScenePath);
            continue;
        }
        if (node.kind === 'sceneInstance') {
            paths.add(ownerScenePath ? resolveSceneReference(ownerScenePath, node.scene) : node.scene);
            for (const children of Object.values(node.slots)) {
                collectSceneInstancePaths(children, paths, ownerScenePath);
            }
        }
    }
    return paths;
}

function ensureProjectRootPath(projectTree: ProjectFileTreeNode) {
    const path = projectTree.projectRootPath ?? projectTree.systemPath;
    if (!path) {
        throw new Error('当前项目缺少本机路径，请使用桌面版重新打开项目。');
    }
    return path;
}

async function readProjectFileText(projectTree: ProjectFileTreeNode, file: ProjectFileTreeNode) {
    return readHostProjectFileText(ensureProjectRootPath(projectTree), file.path);
}

function projectFileRelativePath(projectTree: ProjectFileTreeNode, file: ProjectFileTreeNode) {
    if (file.path === projectTree.path) {
        return '';
    }
    return file.path.slice(projectTree.path.length + 1);
}

function findFileByPath(node: ProjectFileTreeNode, path: string): ProjectFileTreeNode | undefined {
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
