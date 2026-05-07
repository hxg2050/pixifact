import type { ComponentSpec, NodeSpec, PrefabSpec, RectTransformSpec } from "./spec";

export type NodeDslOptions = RectTransformSpec & {
    id?: string;
    key?: string;
    role?: string;
    components?: ComponentSpec[];
    children?: NodeSpec[];
};

export function prefab(name: string, root: NodeSpec): PrefabSpec {
    return {
        version: 1,
        type: 'prefab',
        name,
        root,
    };
}

export function group(name: string, options: NodeDslOptions = {}): NodeSpec {
    const {
        id,
        key,
        role,
        components,
        children,
        ...transform
    } = options;

    return {
        id,
        key,
        role,
        name,
        type: 'Group',
        transform,
        components,
        children,
    };
}

export function component(type: string, props?: Record<string, unknown>, id?: string): ComponentSpec {
    return {
        id,
        type,
        props,
    };
}

export function ref(componentId: string, nodeId?: string) {
    if (!nodeId) {
        return componentId;
    }
    return { node: nodeId, component: componentId };
}
