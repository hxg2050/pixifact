import { GameObject, Group } from "../core";
import { ComponentRegistry } from "../core/component/ComponentRegistry";
import type { Component } from "../core";
import type { ComponentSpec, InstantiateContext, InstantiateResult, NodeSpec, PrefabSpec } from "./spec";

type PendingPropAssignment = {
    component: Component;
    key: string;
    value: unknown;
};

function indexNode(map: Map<string, Group>, node: Group, spec: NodeSpec) {
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

function applyTransform(node: Group, spec: NodeSpec) {
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

function resolveComponentRef(value: unknown, nodes: Map<string, Group>, components: Map<string, Component>) {
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
    node: Group,
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

function instantiateNode(
    spec: NodeSpec,
    parent: Group | undefined,
    nodes: Map<string, Group>,
    components: Map<string, Component>,
    pendingProps: PendingPropAssignment[],
) {
    const node = GameObject.instantiate(Group, parent);
    const nodeIds = [spec.id, spec.key, spec.name].filter((value): value is string => !!value);

    indexNode(nodes, node, spec);
    applyTransform(node, spec);

    for (const componentSpec of spec.components ?? []) {
        addComponentFromSpec(node, componentSpec, components, pendingProps, nodeIds);
    }

    for (const childSpec of spec.children ?? []) {
        instantiateNode(childSpec, node, nodes, components, pendingProps);
    }

    return node;
}

export function instantiate(prefab: PrefabSpec | NodeSpec, parent?: Group, context?: InstantiateContext): InstantiateResult<Group> {
    const rootSpec = 'root' in prefab ? prefab.root : prefab;
    const nodes = new Map<string, Group>();
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
