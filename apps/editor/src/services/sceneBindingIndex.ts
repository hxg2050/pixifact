import { extractSceneScriptInterface } from '../../../../packages/pixifact/src/compiler/scriptInterfaceExtractor';
import type { SceneScriptInterface, SceneTemplate, SceneTemplateInterface, SceneTemplateNode } from '../../../../packages/pixifact/src/compiler/spec';
import { parseSceneTemplate } from '../../../../packages/pixifact/src/compiler/templateParser';
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
    for (const file of collectCompilerSceneFiles(projectTree)) {
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
    if (!template.script) {
        throw new Error(`Scene ${file.name} 必须绑定脚本。`);
    }

    const scriptFile = findFileByPath(projectTree, `${projectTree.path}/${template.script.path}`);
    if (!scriptFile) {
        throw new Error(`找不到 Scene 脚本 ${template.script.path}。`);
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
        script: {
            ...template.script,
            className: descriptor.className,
        },
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
) {
    return Object.fromEntries(
        [...collectSceneInstancePaths(nodes)]
            .filter((scenePath) => index[scenePath])
            .map((scenePath) => [scenePath, index[scenePath].interface]),
    );
}

function collectCompilerSceneFiles(node: ProjectFileTreeNode, files: ProjectFileTreeNode[] = []) {
    if (node.kind === 'scene') {
        files.push(node);
        return files;
    }
    for (const child of node.children ?? []) {
        collectCompilerSceneFiles(child, files);
    }
    return files;
}

function collectSceneInstancePaths(nodes: readonly SceneTemplateNode[], paths = new Set<string>()) {
    for (const node of nodes) {
        if (node.kind === 'pixi') {
            collectSceneInstancePaths(node.children, paths);
            continue;
        }
        if (node.kind === 'sceneInstance') {
            paths.add(node.scene);
            for (const children of Object.values(node.slots)) {
                collectSceneInstancePaths(children, paths);
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
