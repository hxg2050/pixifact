import type { ComponentSpec, NodeSpec, PrefabSpec } from "../prefab";

export interface LocatedNode {
    node: NodeSpec;
    parent?: NodeSpec;
    index: number;
}

export interface LocatedComponent {
    component: ComponentSpec;
    index: number;
}

export function cloneValue<T>(value: T): T {
    return structuredClone(value);
}

function nodeMatches(node: NodeSpec, locator: string) {
    return node.id === locator || node.key === locator || node.name === locator;
}

export function findNode(prefab: PrefabSpec, locator: string): LocatedNode | undefined {
    const visit = (node: NodeSpec, parent: NodeSpec | undefined, index: number): LocatedNode | undefined => {
        if (nodeMatches(node, locator)) {
            return { node, parent, index };
        }

        for (let i = 0; i < (node.children?.length ?? 0); i++) {
            const child = node.children![i];
            const found = visit(child, node, i);
            if (found) {
                return found;
            }
        }

        return undefined;
    };

    return visit(prefab.root, undefined, 0);
}

export function findComponent(node: NodeSpec, locator: string): LocatedComponent | undefined {
    const components = node.components ?? [];
    for (let i = 0; i < components.length; i++) {
        const component = components[i];
        if (component.id === locator || component.type === locator) {
            return { component, index: i };
        }
    }
    return undefined;
}

export function hasDuplicateNodeId(prefab: PrefabSpec, id: string) {
    let count = 0;
    const visit = (node: NodeSpec) => {
        if (node.id === id) {
            count++;
        }
        for (const child of node.children ?? []) {
            visit(child);
        }
    };
    visit(prefab.root);
    return count > 0;
}

export function hasDuplicateNodeLocator(prefab: PrefabSpec, locator: string, except?: NodeSpec) {
    let count = 0;
    const visit = (node: NodeSpec) => {
        if (node !== except && (node.id === locator || node.key === locator || node.name === locator)) {
            count++;
        }
        for (const child of node.children ?? []) {
            visit(child);
        }
    };
    visit(prefab.root);
    return count > 0;
}

export function isDescendant(candidate: NodeSpec, parent: NodeSpec) {
    for (const child of parent.children ?? []) {
        if (child === candidate || isDescendant(candidate, child)) {
            return true;
        }
    }
    return false;
}

export function hasDuplicateComponentId(node: NodeSpec, id: string) {
    return (node.components ?? []).some((component) => component.id === id);
}
