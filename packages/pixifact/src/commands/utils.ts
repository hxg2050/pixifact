import type { ComponentSpec, ContainerNodeSpec, NodeSpec, SceneSpec } from "../scene";

export interface LocatedNode {
    node: NodeSpec;
    parent?: ContainerNodeSpec;
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

export function findNode(scene: SceneSpec, locator: string): LocatedNode | undefined {
    const visit = (node: NodeSpec, parent: ContainerNodeSpec | undefined, index: number): LocatedNode | undefined => {
        if (nodeMatches(node, locator)) {
            return { node, parent, index };
        }

        if (node.kind === 'container') {
            for (let i = 0; i < (node.children?.length ?? 0); i++) {
                const child = node.children![i];
                const found = visit(child, node, i);
                if (found) {
                    return found;
                }
            }
        }

        return undefined;
    };

    return visit(scene.root, undefined, 0);
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

export function hasDuplicateNodeId(scene: SceneSpec, id: string) {
    let count = 0;
    const visit = (node: NodeSpec) => {
        if (node.id === id) {
            count++;
        }
        if (node.kind === 'container') {
            for (const child of node.children ?? []) {
                visit(child);
            }
        }
    };
    visit(scene.root);
    return count > 0;
}

export function hasDuplicateNodeLocator(scene: SceneSpec, locator: string, except?: NodeSpec) {
    let count = 0;
    const visit = (node: NodeSpec) => {
        if (node !== except && (node.id === locator || node.key === locator || node.name === locator)) {
            count++;
        }
        if (node.kind === 'container') {
            for (const child of node.children ?? []) {
                visit(child);
            }
        }
    };
    visit(scene.root);
    return count > 0;
}

export function isDescendant(candidate: NodeSpec, parent: NodeSpec) {
    if (parent.kind === 'container') {
        for (const child of parent.children ?? []) {
            if (child === candidate || isDescendant(candidate, child)) {
                return true;
            }
        }
    }
    return false;
}

export function hasDuplicateComponentId(node: NodeSpec, id: string) {
    return (node.components ?? []).some((component) => component.id === id);
}
