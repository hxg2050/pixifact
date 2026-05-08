import { ComponentRegistry } from "../runtime";
import type { ComponentSchema, PropSchema } from "../runtime";
import type { ComponentSpec, NodeSpec, SceneSpec, RectTransformSpec } from "../scene";
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
    kind: NodeSpec['kind'];
    transform: InspectorFieldModel[];
    display: InspectorComponentModel[];
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

function field(key: string, type: string, value: unknown, schema?: PropSchema): InspectorFieldModel {
    return {
        key,
        label: key,
        type,
        value,
        schema,
    };
}

function enumSchema(key: string, options: readonly (string | number)[]): PropSchema {
    return {
        key,
        type: 'enum',
        options,
    };
}

function buildDisplayModel(node: NodeSpec): InspectorComponentModel[] {
    switch (node.kind) {
        case 'image':
            return [{
                type: 'node.image',
                displayName: 'Image',
                fields: [
                    field('mode', 'enum', node.image?.mode, enumSchema('mode', ['sprite', 'nineSlice'])),
                    field('src', 'string', node.image?.src),
                    field('tint', 'color', node.image?.tint),
                    field('leftWidth', 'number', node.image?.leftWidth),
                    field('rightWidth', 'number', node.image?.rightWidth),
                    field('topHeight', 'number', node.image?.topHeight),
                    field('bottomHeight', 'number', node.image?.bottomHeight),
                ],
            }];
        case 'text':
            return [{
                type: 'node.text',
                displayName: 'Text',
                fields: [
                    field('value', 'string', node.text?.value),
                    field('color', 'color', node.text?.color),
                    field('fontSize', 'number', node.text?.fontSize),
                    field('fontFamily', 'string', Array.isArray(node.text?.fontFamily) ? node.text.fontFamily.join(',') : node.text?.fontFamily),
                    field('fontWeight', 'enum', node.text?.fontWeight, enumSchema('fontWeight', ['normal', 'bold', 'bolder', 'lighter', '100', '200', '300', '400', '500', '600', '700', '800', '900'])),
                    field('center', 'boolean', node.text?.center),
                ],
            }];
        case 'input':
            return [{
                type: 'node.input',
                displayName: 'Input',
                fields: [
                    field('value', 'string', node.input?.value),
                    field('backgroundColor', 'color', node.input?.backgroundColor),
                    field('borderColor', 'color', node.input?.borderColor),
                    field('borderSize', 'number', node.input?.borderSize),
                    field('textColor', 'string', node.input?.textColor),
                    field('fontSize', 'number', node.input?.fontSize),
                    field('fontFamily', 'string', Array.isArray(node.input?.fontFamily) ? node.input.fontFamily.join(',') : node.input?.fontFamily),
                    field('paddingLeft', 'number', node.input?.paddingLeft),
                    field('paddingRight', 'number', node.input?.paddingRight),
                    field('paddingTop', 'number', node.input?.paddingTop),
                    field('paddingBottom', 'number', node.input?.paddingBottom),
                ],
            }];
        case 'shape':
            return [{
                type: 'node.shape',
                displayName: 'Shape',
                fields: [
                    field('type', 'enum', node.shape?.type, enumSchema('type', ['rect', 'roundedRect'])),
                    field('color', 'color', node.shape?.color),
                    field('fillAlpha', 'number', node.shape?.fillAlpha),
                    field('radius', 'number', node.shape?.radius),
                    field('strokeColor', 'color', node.shape?.strokeColor),
                    field('strokeWidth', 'number', node.shape?.strokeWidth),
                    field('strokeAlpha', 'number', node.shape?.strokeAlpha),
                ],
            }];
        case 'container':
            return [];
    }
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

export function buildInspectorModel(scene: SceneSpec, nodeLocator: string): InspectorNodeModel | undefined {
    const located = findNode(scene, nodeLocator);
    if (!located) {
        return undefined;
    }

    const node = located.node;
    return {
        id: node.id,
        key: node.key,
        role: node.role,
        name: node.name,
        kind: node.kind,
        transform: buildTransformFields(node),
        display: buildDisplayModel(node),
        components: (node.components ?? []).map(buildComponentModel),
    };
}
