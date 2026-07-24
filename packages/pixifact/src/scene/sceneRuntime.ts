import type { Container } from 'pixi.js';
import type { Group } from '../runtime';

export interface SceneMountResult {
    root: Group;
    nodes: Record<string, Container>;
    parts: Record<string, Container>;
    slots: Record<string, Container>;
}

export interface SceneDefinition {
    assets: string[];
    dependencies: string[];
    mount(root: Group): SceneMountResult;
    prepare(): Promise<void>;
}

const sceneDefinitions = new Map<string, SceneDefinition>();
const scenePathsByConstructor = new WeakMap<object, string>();
const sceneMounts = new WeakMap<Group, SceneMountResult>();
const preparedScenes = new Set<string>();
const preparingScenes = new Map<string, Promise<void>>();

export function registerScene(path: string, definition: SceneDefinition) {
    sceneDefinitions.set(path, definition);
    preparedScenes.delete(path);
    preparingScenes.delete(path);
}

export function registerSceneClass(constructor: object, path: string) {
    scenePathsByConstructor.set(constructor, path);
}

export function mountScene(root: Group, path: string) {
    const definition = sceneDefinitions.get(path);
    if (!definition) {
        throw new Error(`Scene "${path}" has not been registered.`);
    }
    if (!preparedScenes.has(path)) {
        throw new Error(`Scene "${path}" must be prepared before it is instantiated.`);
    }
    const result = definition.mount(root);
    sceneMounts.set(root, result);
    return result;
}

export function mountSceneClass(root: Group, constructor: object) {
    const path = scenePathsByConstructor.get(constructor);
    if (!path) {
        throw new Error(`Scene class "${constructor instanceof Function ? constructor.name : 'unknown'}" has not been bound to a .scene file.`);
    }
    return mountScene(root, path);
}

export async function prepareScene(path: string): Promise<void> {
    if (preparedScenes.has(path)) {
        return;
    }
    assertSceneDependencyGraph(path);
    const pending = preparingScenes.get(path);
    if (pending) {
        return pending;
    }
    const definition = sceneDefinitions.get(path);
    if (!definition) {
        throw new Error(`Scene "${path}" has not been registered.`);
    }
    const preparation = (async () => {
        await Promise.all(definition.dependencies.map((dependency) => prepareScene(dependency)));
        await definition.prepare();
        preparedScenes.add(path);
        preparingScenes.delete(path);
    })().catch((error) => {
        preparingScenes.delete(path);
        throw error;
    });
    preparingScenes.set(path, preparation);
    return preparation;
}

function assertSceneDependencyGraph(
    path: string,
    visiting = new Set<string>(),
    visited = new Set<string>(),
) {
    if (visiting.has(path)) {
        throw new Error(`Scene dependency cycle detected at "${path}".`);
    }
    if (visited.has(path)) {
        return;
    }
    const definition = sceneDefinitions.get(path);
    if (!definition) {
        throw new Error(`Scene "${path}" has not been registered.`);
    }
    visiting.add(path);
    for (const dependency of definition.dependencies) {
        assertSceneDependencyGraph(dependency, visiting, visited);
    }
    visiting.delete(path);
    visited.add(path);
}

export async function prepareSceneClass(constructor: object): Promise<void> {
    const path = scenePathsByConstructor.get(constructor);
    if (!path) {
        throw new Error(`Scene class "${constructor instanceof Function ? constructor.name : 'unknown'}" has not been bound to a .scene file.`);
    }
    return prepareScene(path);
}

export function getSceneNode(root: Group, locator: string) {
    return sceneMounts.get(root)?.nodes[locator];
}
