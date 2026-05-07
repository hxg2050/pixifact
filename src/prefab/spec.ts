export type ComponentRefSpec = string | {
    node?: string;
    component: string;
};

export interface RectTransformSpec {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    anchorX?: number;
    anchorY?: number;
    scaleX?: number;
    scaleY?: number;
    rotation?: number;
}

export interface ComponentSpec {
    id?: string;
    type: string;
    props?: Record<string, unknown>;
}

export interface NodeSpec {
    id?: string;
    key?: string;
    role?: string;
    name?: string;
    type: 'Group';
    transform?: RectTransformSpec;
    components?: ComponentSpec[];
    children?: NodeSpec[];
}

export interface PrefabSpec {
    version: number;
    type: 'prefab';
    name: string;
    root: NodeSpec;
}

export interface InstantiateContext {
    actions?: Record<string, (...args: unknown[]) => void>;
}

export interface InstantiateResult<T = unknown> {
    root: T;
    nodes: Map<string, T>;
    components: Map<string, unknown>;
}
