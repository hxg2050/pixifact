import {
    defaultSceneSourceRoots,
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
import { readEditorSceneBindings } from './editorApi';
import {
    findFileByPath,
    projectFileRelativePath,
    readProjectFileText,
    type ProjectFileTreeNode,
} from './projectFileTree';

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
    return readCompilerSceneBindings(projectTree);
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
    const bindings = await readCompilerSceneBindings(projectTree, { file, template });
    const scenePath = normalizeSceneAssetId(projectFileRelativePath(projectTree, file));
    const binding = bindings[scenePath];
    if (!binding) {
        throw new Error(`找不到 Scene 绑定 ${scenePath}。`);
    }
    return binding;
}

interface CompilerSceneBindingSource {
    scenePath: string;
    file: ProjectFileTreeNode;
    scriptFile: ProjectFileTreeNode;
    template: SceneTemplate;
}

async function readCompilerSceneBindings(
    projectTree: ProjectFileTreeNode,
    templateOverride?: { file: ProjectFileTreeNode; template: SceneTemplate },
): Promise<CompilerSceneBindingIndex> {
    const sources: CompilerSceneBindingSource[] = [];
    for (const file of collectCompilerSceneFiles(projectTree, projectTree)) {
        sources.push(await readCompilerSceneBindingSource(projectTree, file, templateOverride));
    }

    const descriptors = await readEditorSceneBindings();

    return Object.fromEntries(sources.map((source) => {
        const descriptor = descriptors[source.scenePath];
        if (!descriptor) {
            throw new Error('No @scene decorator found.');
        }
        if (descriptor.className !== source.template.name) {
            throw new Error(`Scene ${source.file.name} 的 name "${source.template.name}" 必须等于脚本 @scene 类名 "${descriptor.className}"。`);
        }

        const boundTemplate: SceneTemplate = {
            ...source.template,
            interface: descriptor.interface,
        };

        return [source.scenePath, {
            scenePath: source.scenePath,
            file: source.file,
            scriptFile: source.scriptFile,
            template: boundTemplate,
            descriptor,
            className: descriptor.className,
            interface: descriptor.interface,
        } satisfies CompilerSceneBinding];
    }));
}

async function readCompilerSceneBindingSource(
    projectTree: ProjectFileTreeNode,
    file: ProjectFileTreeNode,
    templateOverride?: { file: ProjectFileTreeNode; template: SceneTemplate },
): Promise<CompilerSceneBindingSource> {
    const scenePath = normalizeSceneAssetId(projectFileRelativePath(projectTree, file));
    const scriptPath = pairedSceneScriptPath(scenePath);
    const scriptFile = findFileByPath(projectTree, `${projectTree.path}/${scriptPath}`);
    if (!scriptFile) {
        throw new Error(`找不到 Scene 脚本 ${scriptPath}。`);
    }

    return {
        scenePath,
        file,
        scriptFile,
        template: templateOverride?.file.path === file.path
            ? templateOverride.template
            : parseSceneTemplate(await readProjectFileText(projectTree, file)),
    };
}

export function sceneInterfacesForCompilerTemplate(
    index: CompilerSceneBindingIndex,
    nodes: readonly SceneTemplateNode[],
    ownerScenePath?: string,
) {
    return {
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
