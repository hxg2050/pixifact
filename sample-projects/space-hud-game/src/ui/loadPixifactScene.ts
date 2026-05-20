import type { Group, SceneSpec } from 'pixifact';
import { instantiateScene } from 'pixifact';

export async function loadPixifactScene(path: string, parent: Group) {
    const response = await fetch(path);
    if (!response.ok) {
        throw new Error(`Failed to load Scene ${path}.`);
    }
    const scene = await response.json() as SceneSpec;
    return instantiateScene(scene, parent);
}
