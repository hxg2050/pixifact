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

export type SceneNodeKind = 'container' | 'image' | 'text' | 'input' | 'shape';

export interface BaseNodeSpec {
    id?: string;
    key?: string;
    role?: string;
    name?: string;
    kind: SceneNodeKind;
    transform?: RectTransformSpec;
    components?: ComponentSpec[];
}

export interface ContainerNodeSpec extends BaseNodeSpec {
    kind: 'container';
    children?: NodeSpec[];
}

export interface ImageNodeSpec extends BaseNodeSpec {
    kind: 'image';
    image?: {
        mode?: 'sprite' | 'nineSlice';
        src?: string;
        tint?: number;
        leftWidth?: number;
        rightWidth?: number;
        topHeight?: number;
        bottomHeight?: number;
    };
}

export interface TextNodeSpec extends BaseNodeSpec {
    kind: 'text';
    text?: {
        value?: string;
        color?: number;
        fontSize?: number;
        fontFamily?: string | string[];
        fontWeight?: string;
        center?: boolean;
    };
}

export interface InputNodeSpec extends BaseNodeSpec {
    kind: 'input';
    input?: {
        value?: string;
        backgroundColor?: number;
        borderColor?: number;
        borderSize?: number;
        textColor?: string;
        fontSize?: number;
        fontFamily?: string | string[];
        paddingLeft?: number;
        paddingRight?: number;
        paddingTop?: number;
        paddingBottom?: number;
    };
}

export interface ShapeNodeSpec extends BaseNodeSpec {
    kind: 'shape';
    shape?: {
        type?: 'rect' | 'roundedRect';
        color?: number;
        fillAlpha?: number;
        radius?: number;
        strokeColor?: number;
        strokeWidth?: number;
        strokeAlpha?: number;
    };
}

export type NodeSpec =
    | ContainerNodeSpec
    | ImageNodeSpec
    | TextNodeSpec
    | InputNodeSpec
    | ShapeNodeSpec;

export interface SceneSpec {
    version: number;
    type: 'scene';
    name: string;
    root: ContainerNodeSpec;
}

export interface InstantiateContext {
    actions?: Record<string, (...args: unknown[]) => void>;
}

export interface InstantiateResult<T = unknown> {
    root: T;
    nodes: Map<string, T>;
    components: Map<string, unknown>;
}
