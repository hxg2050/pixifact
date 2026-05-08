import type {
    ComponentSpec,
    ContainerNodeSpec,
    ImageNodeSpec,
    InputNodeSpec,
    NodeSpec,
    RectTransformSpec,
    SceneSpec,
    ShapeNodeSpec,
    TextNodeSpec,
} from "./spec";

export type NodeDslOptions = RectTransformSpec & {
    id?: string;
    key?: string;
    role?: string;
    components?: ComponentSpec[];
};

export type ContainerDslOptions = NodeDslOptions & {
    children?: NodeSpec[];
};

export type ImageDslOptions = NodeDslOptions & NonNullable<ImageNodeSpec['image']>;
export type TextDslOptions = NodeDslOptions & NonNullable<TextNodeSpec['text']>;
export type InputDslOptions = NodeDslOptions & NonNullable<InputNodeSpec['input']>;
export type ShapeDslOptions = NodeDslOptions & NonNullable<ShapeNodeSpec['shape']>;

const transformKeys = new Set([
    'x',
    'y',
    'width',
    'height',
    'anchorX',
    'anchorY',
    'scaleX',
    'scaleY',
    'rotation',
]);

function splitNodeOptions<T extends NodeDslOptions>(options: T) {
    const { id, key, role, components, ...rest } = options;
    const transform: RectTransformSpec = {};
    const props: Record<string, unknown> = {};

    for (const [prop, value] of Object.entries(rest)) {
        if (transformKeys.has(prop)) {
            (transform as Record<string, unknown>)[prop] = value;
        } else {
            props[prop] = value;
        }
    }

    return { id, key, role, components, transform, props };
}

export function scene(name: string, root: ContainerNodeSpec): SceneSpec {
    return {
        version: 1,
        type: 'scene',
        name,
        root,
    };
}

export function container(name: string, options: ContainerDslOptions = {}): ContainerNodeSpec {
    const {
        children,
    } = options;
    const { id, key, role, components, transform } = splitNodeOptions(options);

    return {
        id,
        key,
        role,
        name,
        kind: 'container',
        transform,
        components,
        children,
    };
}

export function image(name: string, options: ImageDslOptions = {}): ImageNodeSpec {
    const { id, key, role, components, transform, props } = splitNodeOptions(options);
    return {
        id,
        key,
        role,
        name,
        kind: 'image',
        transform,
        components,
        image: props,
    };
}

export function text(name: string, options: TextDslOptions = {}): TextNodeSpec {
    const { id, key, role, components, transform, props } = splitNodeOptions(options);
    return {
        id,
        key,
        role,
        name,
        kind: 'text',
        transform,
        components,
        text: props,
    };
}

export function input(name: string, options: InputDslOptions = {}): InputNodeSpec {
    const { id, key, role, components, transform, props } = splitNodeOptions(options);
    return {
        id,
        key,
        role,
        name,
        kind: 'input',
        transform,
        components,
        input: props,
    };
}

export function shape(name: string, options: ShapeDslOptions = {}): ShapeNodeSpec {
    const { id, key, role, components, transform, props } = splitNodeOptions(options);
    return {
        id,
        key,
        role,
        name,
        kind: 'shape',
        transform,
        components,
        shape: props,
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
