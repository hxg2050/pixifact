import type { Container } from 'pixi.js';

export const runtimeBehavior: unique symbol = Symbol('pixifact.runtimeBehavior');

interface RuntimeBehaviorContainer extends Container {
    [runtimeBehavior](): void;
}

const activatedContainers = new WeakSet<Container>();

export function activateRuntimeTree(root: Container) {
    if (runtimeBehavior in root && !activatedContainers.has(root)) {
        activatedContainers.add(root);
        (root as RuntimeBehaviorContainer)[runtimeBehavior]();
    }
    for (const child of root.children) {
        activateRuntimeTree(child);
    }
}
