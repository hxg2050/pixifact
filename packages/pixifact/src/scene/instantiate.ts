import { GameObject, Group } from "../runtime";
import { ComponentRegistry } from "../runtime/component/ComponentRegistry";
import type { Component } from "../runtime";
import { Input } from "../nodes/Input";
import type { ComponentSpec, InstantiateContext, InstantiateResult, NodeSpec, SceneSpec } from "./spec";
import "../nodes/graphics";

type PendingPropAssignment = {
    component: Component;
    key: string;
    value: unknown;
};

type SceneRuntimeNode = Group | Input;

function indexNode(map: Map<string, SceneRuntimeNode>, node: SceneRuntimeNode, spec: NodeSpec) {
    if (spec.key) {
        map.set(spec.key, node);
    }
    if (spec.id) {
        map.set(spec.id, node);
    }
    if (spec.name) {
        map.set(spec.name, node);
    }
}

function applyTransform(node: SceneRuntimeNode, spec: NodeSpec) {
    const transform = spec.transform;
    if (!transform) {
        return;
    }

    if (transform.width !== undefined) node.width = transform.width;
    if (transform.height !== undefined) node.height = transform.height;
    if (transform.x !== undefined) node.x = transform.x;
    if (transform.y !== undefined) node.y = transform.y;
    if (transform.anchorX !== undefined) node.anchorX = transform.anchorX;
    if (transform.anchorY !== undefined) node.anchorY = transform.anchorY;
    if (transform.scaleX !== undefined) node.scaleX = transform.scaleX;
    if (transform.scaleY !== undefined) node.scaleY = transform.scaleY;
    if (transform.rotation !== undefined) node.rotation = transform.rotation;
}

function resolveComponentRef(value: unknown, nodes: Map<string, SceneRuntimeNode>, components: Map<string, Component>) {
    if (typeof value === 'string') {
        return components.get(value) ?? nodes.get(value) ?? value;
    }

    if (!value || typeof value !== 'object') {
        return value;
    }

    const ref = value as { node?: string; component?: string };
    if (!ref.component) {
        return value;
    }

    if (ref.node) {
        return components.get(`${ref.node}:${ref.component}`) ?? components.get(ref.component) ?? value;
    }

    return components.get(ref.component) ?? value;
}

function resolveEvent(value: unknown, context: InstantiateContext | undefined) {
    if (typeof value !== 'string') {
        return value;
    }
    return context?.actions?.[value] ?? value;
}

function addComponentFromSpec(
    node: SceneRuntimeNode,
    spec: ComponentSpec,
    components: Map<string, Component>,
    pendingProps: PendingPropAssignment[],
    nodeIds: string[],
) {
    const schema = ComponentRegistry.get(spec.type);
    if (!schema) {
        throw new Error(`Unknown component type "${spec.type}".`);
    }

    const initialProps: Record<string, unknown> = {};

    for (const prop of schema.props) {
        if (prop.default !== undefined) {
            initialProps[prop.key] = prop.default;
        }
    }

    for (const [key, value] of Object.entries(spec.props ?? {})) {
        const prop = schema.props.find((candidate) => candidate.key === key);
        if (prop?.type === 'componentRef' || prop?.type === 'nodeRef' || prop?.type === 'event') {
            continue;
        }
        initialProps[key] = value;
    }

    const component = node.addComponent(schema.ctor, initialProps as Partial<Component>);

    if (spec.id) {
        components.set(spec.id, component);
        for (const nodeId of nodeIds) {
            components.set(`${nodeId}:${spec.id}`, component);
        }
    }

    for (const [key, value] of Object.entries(spec.props ?? {})) {
        const prop = schema.props.find((candidate) => candidate.key === key);
        if (prop?.type === 'componentRef' || prop?.type === 'nodeRef' || prop?.type === 'event') {
            pendingProps.push({ component, key, value });
        }
    }

    return component;
}

function rendererId(spec: NodeSpec, fallback: string) {
    return spec.id ?? spec.key ?? spec.name ?? fallback;
}

function applyTextNode(
    node: Group,
    spec: Extract<NodeSpec, { kind: 'text' }>,
    components: Map<string, Component>,
    pendingProps: PendingPropAssignment[],
    nodeIds: string[],
) {
    addComponentFromSpec(node, {
        id: rendererId(spec, 'text'),
        type: 'ui.TextGraphic',
        props: {
            text: spec.text?.value ?? '',
            color: spec.text?.color ?? 0x000000,
            fontSize: spec.text?.fontSize ?? 14,
            fontFamily: spec.text?.fontFamily ?? 'Arial',
            fontWeight: spec.text?.fontWeight ?? 'normal',
            center: spec.text?.center ?? false,
        },
    }, components, pendingProps, nodeIds);
}

function applyImageNode(
    node: Group,
    spec: Extract<NodeSpec, { kind: 'image' }>,
    components: Map<string, Component>,
    pendingProps: PendingPropAssignment[],
    nodeIds: string[],
) {
    addComponentFromSpec(node, {
        id: rendererId(spec, 'image'),
        type: 'ui.ImageGraphic',
        props: {
            src: spec.image?.src ?? '',
            tint: spec.image?.tint ?? 0xffffff,
        },
    }, components, pendingProps, nodeIds);
}

function applyShapeNode(
    node: Group,
    spec: Extract<NodeSpec, { kind: 'shape' }>,
    components: Map<string, Component>,
    pendingProps: PendingPropAssignment[],
    nodeIds: string[],
) {
    addComponentFromSpec(node, {
        id: rendererId(spec, 'shape'),
        type: 'ui.RoundedRectGraphic',
        props: {
            color: spec.shape?.color ?? 0xffffff,
            fillAlpha: spec.shape?.fillAlpha ?? 1,
            radius: spec.shape?.type === 'rect' ? 0 : spec.shape?.radius ?? 0,
            strokeColor: spec.shape?.strokeColor ?? 0x000000,
            strokeWidth: spec.shape?.strokeWidth ?? 0,
            strokeAlpha: spec.shape?.strokeAlpha ?? 1,
        },
    }, components, pendingProps, nodeIds);
}

function applyInputNode(node: Input, spec: Extract<NodeSpec, { kind: 'input' }>) {
    if (!spec.input) {
        return;
    }
    if (spec.input.value !== undefined) node.value = spec.input.value;
    if (spec.input.backgroundColor !== undefined) node.backgroundColor = spec.input.backgroundColor;
    if (spec.input.borderColor !== undefined) node.borderColor = spec.input.borderColor;
    if (spec.input.borderSize !== undefined) node.borderSize = spec.input.borderSize;
    if (spec.input.fontSize !== undefined) node.fontSize = spec.input.fontSize;
    if (spec.input.fontFamily !== undefined) node.fontFamily = spec.input.fontFamily;
    if (spec.input.paddingLeft !== undefined) node.paddingLeft = spec.input.paddingLeft;
    if (spec.input.paddingRight !== undefined) node.paddingRight = spec.input.paddingRight;
    if (spec.input.paddingTop !== undefined) node.paddingTop = spec.input.paddingTop;
    if (spec.input.paddingBottom !== undefined) node.paddingBottom = spec.input.paddingBottom;
}

function instantiateNode(
    spec: NodeSpec,
    parent: Group | undefined,
    nodes: Map<string, SceneRuntimeNode>,
    components: Map<string, Component>,
    pendingProps: PendingPropAssignment[],
) {
    const node = GameObject.instantiate(spec.kind === 'input' ? Input : Group, parent);
    const nodeIds = [spec.id, spec.key, spec.name].filter((value): value is string => !!value);

    indexNode(nodes, node, spec);
    applyTransform(node, spec);

    switch (spec.kind) {
        case 'image':
            applyImageNode(node as Group, spec, components, pendingProps, nodeIds);
            break;
        case 'text':
            applyTextNode(node as Group, spec, components, pendingProps, nodeIds);
            break;
        case 'shape':
            applyShapeNode(node as Group, spec, components, pendingProps, nodeIds);
            break;
        case 'input':
            applyInputNode(node as Input, spec);
            break;
    }

    for (const componentSpec of spec.components ?? []) {
        addComponentFromSpec(node, componentSpec, components, pendingProps, nodeIds);
    }

    if (spec.kind === 'container') {
        for (const childSpec of spec.children ?? []) {
            instantiateNode(childSpec, node as Group, nodes, components, pendingProps);
        }
    }

    return node;
}

export function instantiateScene(scene: SceneSpec | NodeSpec, parent?: Group, context?: InstantiateContext): InstantiateResult<SceneRuntimeNode> {
    const rootSpec = 'root' in scene ? scene.root : scene;
    const nodes = new Map<string, SceneRuntimeNode>();
    const components = new Map<string, Component>();
    const pendingProps: PendingPropAssignment[] = [];

    const root = instantiateNode(rootSpec, parent, nodes, components, pendingProps);

    for (const item of pendingProps) {
        const schema = ComponentRegistry.getByCtor(item.component.constructor as never);
        const prop = schema?.props.find((candidate) => candidate.key === item.key);
        const value = prop?.type === 'componentRef' || prop?.type === 'nodeRef'
            ? resolveComponentRef(item.value, nodes, components)
            : prop?.type === 'event'
                ? resolveEvent(item.value, context)
                : item.value;
        (item.component as unknown as Record<string, unknown>)[item.key] = value;
    }

    return { root, nodes, components };
}

export const instantiate = instantiateScene;
