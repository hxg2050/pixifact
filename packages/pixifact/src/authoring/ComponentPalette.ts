import { ComponentRegistry } from "../runtime";
import type { ComponentSchema } from "../runtime";
import type { ComponentSpec, SceneSpec } from "../scene";
import { findNode } from "../commands/utils";

export interface PaletteComponentItem {
    type: string;
    displayName: string;
    category: string;
    description?: string;
    disabledReason?: string;
    schema: ComponentSchema;
}

export interface ComponentPaletteOptions {
    scene?: SceneSpec;
    node?: string;
}

function componentIdFromType(type: string) {
    const raw = type.split('.').at(-1) ?? type;
    return raw.charAt(0).toLowerCase() + raw.slice(1);
}

function disabledReason(schema: ComponentSchema, options: ComponentPaletteOptions) {
    if (!schema.disallowMultiple || !options.scene || !options.node) {
        return undefined;
    }

    const node = findNode(options.scene, options.node)?.node;
    if (!node) {
        return undefined;
    }

    return (node.components ?? []).some((component) => component.type === schema.type)
        ? `${schema.displayName ?? schema.type} already exists on this node.`
        : undefined;
}

export function listPaletteComponents(options: ComponentPaletteOptions = {}): PaletteComponentItem[] {
    return ComponentRegistry.list()
        .filter((schema) => schema.category !== 'UI/Graphic')
        .map((schema) => ({
            type: schema.type,
            displayName: schema.displayName ?? schema.type,
            category: schema.category ?? 'Other',
            description: schema.description,
            disabledReason: disabledReason(schema, options),
            schema,
        }))
        .sort((a, b) => a.category.localeCompare(b.category) || a.displayName.localeCompare(b.displayName));
}

export function createComponentSpecFromSchema(schemaOrType: ComponentSchema | string, id?: string): ComponentSpec {
    const schema = typeof schemaOrType === 'string'
        ? ComponentRegistry.get(schemaOrType)
        : schemaOrType;

    if (!schema) {
        throw new Error(`Unknown component type "${schemaOrType}".`);
    }

    const props: Record<string, unknown> = {};
    for (const prop of schema.props) {
        if (prop.default !== undefined && prop.serialize !== false) {
            props[prop.key] = structuredClone(prop.default);
        }
    }

    return {
        id: id ?? componentIdFromType(schema.type),
        type: schema.type,
        props,
    };
}
