import { ComponentRegistry } from "../core";
import type { ComponentSchema, PropSchema } from "../core";
import type { ComponentSpec, NodeSpec, PrefabSpec, RectTransformSpec } from "../prefab";
import { findNode } from "../commands/utils";

export interface InspectorFieldModel {
    key: string;
    label: string;
    type: string;
    value: unknown;
    schema?: PropSchema;
}

export interface InspectorComponentModel {
    id?: string;
    type: string;
    displayName: string;
    schema?: ComponentSchema;
    fields: InspectorFieldModel[];
}

export interface InspectorNodeModel {
    id?: string;
    key?: string;
    role?: string;
    name?: string;
    transform: InspectorFieldModel[];
    components: InspectorComponentModel[];
}

const transformFields: Array<keyof RectTransformSpec> = [
    'x',
    'y',
    'width',
    'height',
    'anchorX',
    'anchorY',
    'scaleX',
    'scaleY',
    'rotation',
];

function buildTransformFields(node: NodeSpec): InspectorFieldModel[] {
    const transform = node.transform ?? {};
    return transformFields.map((key) => ({
        key,
        label: key,
        type: 'number',
        value: transform[key],
    }));
}

function buildComponentFields(component: ComponentSpec, schema: ComponentSchema | undefined): InspectorFieldModel[] {
    return (schema?.props ?? []).filter((prop) => !prop.hidden).map((prop) => ({
        key: prop.key,
        label: prop.key,
        type: prop.type,
        value: component.props?.[prop.key] ?? prop.default,
        schema: prop,
    }));
}

function buildComponentModel(component: ComponentSpec): InspectorComponentModel {
    const schema = ComponentRegistry.get(component.type);
    return {
        id: component.id,
        type: component.type,
        displayName: schema?.displayName ?? component.type,
        schema,
        fields: buildComponentFields(component, schema),
    };
}

export function buildInspectorModel(prefab: PrefabSpec, nodeLocator: string): InspectorNodeModel | undefined {
    const located = findNode(prefab, nodeLocator);
    if (!located) {
        return undefined;
    }

    const node = located.node;
    return {
        id: node.id,
        key: node.key,
        role: node.role,
        name: node.name,
        transform: buildTransformFields(node),
        components: (node.components ?? []).map(buildComponentModel),
    };
}
