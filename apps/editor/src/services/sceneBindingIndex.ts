import {
    normalizeSceneAssetId,
    pairedSceneScriptPath,
    parseSceneTemplate,
    resolveSceneReference,
    type SceneScriptInterface,
    type SceneTemplate,
    type SceneTemplateInterface,
    type SceneTemplateNode,
} from 'pixifact/compiler';
import { readEditorSceneBindings } from './editorApi';
import {
    findFileByPath,
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

/** Await a shared request without aborting another preview's use of it. */
export function awaitScenePreviewTask<T>(task: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return task;
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
        const abort = () => {
            signal.removeEventListener('abort', abort);
            reject(signal.reason);
        };
        signal.addEventListener('abort', abort, { once: true });
        task.then((value) => {
            signal.removeEventListener('abort', abort);
            resolve(value);
        }, (error) => {
            signal.removeEventListener('abort', abort);
            reject(error);
        });
    });
}

export class CompilerSceneBindingCache {
    #templates = new Map<string, Promise<SceneTemplate>>();
    #descriptors?: Promise<Record<string, SceneScriptInterface>>;

    readDescriptors() {
        if (!this.#descriptors) {
            const task = readEditorSceneBindings().catch((error) => {
                if (this.#descriptors === task) this.#descriptors = undefined;
                throw error;
            });
            this.#descriptors = task;
        }
        return this.#descriptors;
    }

    invalidate(paths: readonly string[]) {
        for (const path of paths) {
            for (const templatePath of this.#templates.keys()) {
                if (templatePath === path || templatePath.startsWith(`${path}/`)) this.#templates.delete(templatePath);
            }
            if (/\.[cm]?[jt]sx?$/.test(path)) this.invalidateDescriptors();
        }
    }

    invalidateDescriptors() {
        this.#descriptors = undefined;
    }

    clear() {
        this.#templates.clear();
        this.#descriptors = undefined;
    }

    readTemplate(projectTree: ProjectFileTreeNode, scenePath: string) {
        scenePath = normalizeSceneAssetId(scenePath);
        let task = this.#templates.get(scenePath);
        if (!task) {
            const file = findFileByPath(projectTree, `${projectTree.path}/${scenePath}`)!;
            task = readProjectFileText(projectTree, file).then(parseSceneTemplate).catch((error) => {
                if (this.#templates.get(scenePath) === task) this.#templates.delete(scenePath);
                throw error;
            });
            this.#templates.set(scenePath, task);
        }
        return task;
    }

    async readIndex(
        projectTree: ProjectFileTreeNode,
        scenePath: string,
        template?: SceneTemplate,
        signal?: AbortSignal,
    ): Promise<CompilerSceneBindingIndex> {
        signal?.throwIfAborted();
        scenePath = normalizeSceneAssetId(scenePath);
        const descriptors = await awaitScenePreviewTask(this.readDescriptors(), signal);
        const bindings: CompilerSceneBindingIndex = {};
        let pending = [scenePath];
        while (pending.length > 0) {
            const sources = await awaitScenePreviewTask(Promise.all(pending.map(async (path) => ({
                scenePath: path,
                template: path === scenePath && template ? template : await this.readTemplate(projectTree, path),
            }))), signal);
            pending = [];
            for (const source of sources) {
                const file = findFileByPath(projectTree, `${projectTree.path}/${source.scenePath}`)!;
                const scriptFile = findFileByPath(projectTree, `${projectTree.path}/${pairedSceneScriptPath(source.scenePath)}`);
                if (!scriptFile) throw new Error(`找不到 Scene 脚本 ${pairedSceneScriptPath(source.scenePath)}。`);
                const descriptor = descriptors[source.scenePath];
                if (!descriptor) throw new Error('No @scene decorator found.');
                if (descriptor.className !== source.template.name) {
                    throw new Error(`Scene ${file.name} 的 name "${source.template.name}" 必须等于脚本 @scene 类名 "${descriptor.className}"。`);
                }
                bindings[source.scenePath] = {
                    scenePath: source.scenePath,
                    file,
                    scriptFile,
                    template: { ...source.template, interface: descriptor.interface },
                    descriptor,
                    className: descriptor.className,
                    interface: descriptor.interface,
                };
            }
            for (const source of sources) {
                for (const dependency of collectSceneInstancePaths(source.template.children, new Set(), source.scenePath)) {
                    if (!bindings[dependency] && !pending.includes(dependency)) pending.push(dependency);
                }
            }
        }
        return bindings;
    }
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
