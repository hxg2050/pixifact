import type { Container } from 'pixi.js';
import type { Group } from '../runtime';

export interface SceneMountResult {
    root: Group;
    nodes: Record<string, Container>;
    parts: Record<string, Container>;
    slots: Record<string, Container>;
}

export interface SceneDefinition {
    mount(root: Group): SceneMountResult;
}

const sceneDefinitions = new Map<string, SceneDefinition>();
const scenePathsByConstructor = new WeakMap<object, string>();
const sceneMounts = new WeakMap<Group, SceneMountResult>();

export function registerScene(path: string, definition: SceneDefinition) {
    sceneDefinitions.set(path, definition);
}

export function registerSceneClass(constructor: object, path: string) {
    scenePathsByConstructor.set(constructor, path);
}

export function mountScene(root: Group, path: string) {
    const definition = sceneDefinitions.get(path);
    if (!definition) {
        throw new Error(`Scene "${path}" has not been registered.`);
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

export function getSceneNode(root: Group, locator: string) {
    return sceneMounts.get(root)?.nodes[locator];
}
