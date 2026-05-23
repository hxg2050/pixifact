import type { Container } from 'pixi.js';

export interface SceneMountResult {
    root: Container;
    parts: Record<string, Container>;
    slots: Record<string, Container>;
}

export interface SceneDefinition {
    mount(root: Container): SceneMountResult;
}

const sceneDefinitions = new Map<string, SceneDefinition>();

export function registerScene(path: string, definition: SceneDefinition) {
    sceneDefinitions.set(path, definition);
}

export function mountScene(root: Container, path: string) {
    const definition = sceneDefinitions.get(path);
    if (!definition) {
        throw new Error(`Scene "${path}" has not been registered.`);
    }
    return definition.mount(root);
}
