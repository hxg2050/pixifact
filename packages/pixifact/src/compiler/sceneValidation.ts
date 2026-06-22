import type { SceneInstanceTemplateNode, SceneTemplate, SceneTemplateInterface, SceneTemplateNode, SceneTemplatePropContract, SceneTemplateValue } from './spec';
import {
    isPixiSceneNodeType,
    pixiSceneFieldSchema,
    pixiSceneLayoutProps,
    pixiSceneNodeAcceptsChildren,
    pixiSceneNodePropKeys,
    pixiSceneTransformProps,
    pixiSceneDisplayProps,
} from './pixiNodeSchema';
import { parseSceneTemplate } from './templateParser';
import { serializeSceneTemplate } from './templateSerializer';

export interface SceneTemplateNodeSummary {
    id?: string;
    kind: SceneTemplateNode['kind'];
    type: string;
    path: string;
    propKeys: string[];
    childCount: number;
}

export interface SceneTemplateInspection {
    name: string;
    props: Record<string, SceneTemplateValue>;
    nodeCount: number;
    nodes: SceneTemplateNodeSummary[];
}

export interface SceneValidationDiagnostic {
    path: string;
    prop: string;
    expected: string;
    actual: string;
    hint?: string;
    line?: number;
    column?: number;
}

export function createSceneRevision(source: string) {
    const canonical = serializeSceneTemplate(parseSceneTemplate(source));
    let hash = 0x811c9dc5;
    for (let index = 0; index < canonical.length; index += 1) {
        hash = Math.imul(hash ^ canonical.charCodeAt(index), 0x01000193);
    }
    return `scene:${canonical.length}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function inspectSceneTemplate(template: SceneTemplate): SceneTemplateInspection {
    const nodes: SceneTemplateNodeSummary[] = [];

    function visit(node: SceneTemplateNode, path: string) {
        if (node.kind === 'slotOutlet') {
            nodes.push({
                kind: 'slotOutlet',
                type: 'slot',
                path,
                propKeys: ['name'],
                childCount: 0,
            });
            return;
        }

        if (node.kind === 'pixi') {
            nodes.push({
                id: node.id,
                kind: node.kind,
                type: node.type,
                path,
                propKeys: Object.keys(node.props).sort(),
                childCount: node.children.length,
            });
            node.children.forEach((child, index) => visit(child, `${path}/${nodePathSegment(index, child)}`));
            return;
        }

        nodes.push({
            id: node.id,
            kind: node.kind,
            type: node.type,
            path,
            propKeys: Object.keys(node.props).sort(),
            childCount: Object.values(node.slots).reduce((sum, children) => sum + children.length, 0),
        });
        for (const [slot, children] of Object.entries(node.slots)) {
            children.forEach((child, index) => visit(child, `${path}/slot:${slot}/${nodePathSegment(index, child)}`));
        }
    }

    template.children.forEach((child, index) => visit(child, nodePathSegment(index, child)));
    return {
        name: template.name,
        props: template.props,
        nodeCount: nodes.length,
        nodes,
    };
}

export interface ValidateSceneContentOptions {
    scene: string;
    content: string;
    existingAssets?: ReadonlySet<string>;
    sceneInterfaces?: Record<string, SceneTemplateInterface>;
    normalizeSceneReference?: (scene: string) => string;
}

interface SceneValidationContext {
    existingAssets?: ReadonlySet<string>;
    sceneInterfaces?: Record<string, SceneTemplateInterface>;
    normalizeSceneReference?: (scene: string) => string;
}

export type SceneContentValidationResult =
    | {
        ok: true;
        scene: string;
        revision: string;
        canonicalContent: string;
        summary: SceneTemplateInspection;
    }
    | {
        ok: false;
        scene: string;
        revision?: string;
        error: string;
        diagnostics?: SceneValidationDiagnostic[];
        hint?: string;
    };

export function validateSceneContent(options: ValidateSceneContentOptions): SceneContentValidationResult {
    try {
        const template = parseSceneTemplate(options.content);
        const diagnostics = validateSceneTemplate(template, options);
        const revision = createSceneRevision(options.content);
        if (diagnostics.length > 0) {
            return {
                ok: false,
                scene: options.scene,
                revision,
                error: 'Scene validation failed.',
                diagnostics,
                hint: 'Fix the listed diagnostics, then run scene validate again.',
            };
        }
        return {
            ok: true,
            scene: options.scene,
            revision,
            canonicalContent: serializeSceneTemplate(template),
            summary: inspectSceneTemplate(template),
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            ok: false,
            scene: options.scene,
            error: 'Scene parse failed.',
            diagnostics: [sceneSourceDiagnostic(options.content, message)],
            hint: 'Fix the listed diagnostics, then run scene validate again.',
        };
    }
}

function sceneSourceDiagnostic(source: string, message: string): SceneValidationDiagnostic {
    return {
        path: '__scene__',
        prop: 'source',
        expected: 'valid Pixifact .scene source',
        actual: message,
        hint: 'Fix the .scene source syntax near the reported location.',
        ...sourcePositionFromMessage(source, message),
    };
}

function sourcePositionFromMessage(source: string, message: string) {
    const match = message.match(/\boffset (\d+)\b/);
    if (!match) {
        return {};
    }
    const offset = Number(match[1]);
    if (!Number.isInteger(offset) || offset < 0) {
        return {};
    }
    const before = source.slice(0, offset);
    const lines = before.split('\n');
    return {
        line: lines.length,
        column: lines.at(-1)!.length + 1,
    };
}

function validateSceneTemplate(
    template: SceneTemplate,
    context: SceneValidationContext,
): SceneValidationDiagnostic[] {
    return template.children.flatMap((child, index) => validateSceneNode(
        child,
        nodePathSegment(index, child),
        context,
    ));
}

function validateSceneNode(
    node: SceneTemplateNode,
    path: string,
    context: SceneValidationContext,
): SceneValidationDiagnostic[] {
    if (node.kind === 'slotOutlet') {
        return [];
    }

    if (node.kind === 'pixi') {
        return [
            ...validatePixiNode(node, path, context.existingAssets),
            ...node.children.flatMap((child, index) => validateSceneNode(
                child,
                `${path}/${nodePathSegment(index, child)}`,
                context,
            )),
        ];
    }

    return [
        ...validateSceneInstanceNode(node, path, context),
        ...Object.entries(node.slots).flatMap(([slot, children]) => children.flatMap((child, index) => validateSceneNode(
            child,
            `${path}/slot:${slot}/${nodePathSegment(index, child)}`,
            context,
        ))),
    ];
}

function validatePixiNode(
    node: Exclude<SceneTemplateNode, SceneInstanceTemplateNode | { kind: 'slotOutlet' }>,
    path: string,
    existingAssets: ReadonlySet<string> | undefined,
): SceneValidationDiagnostic[] {
    if (!isPixiSceneNodeType(node.type)) {
        return [{
            path,
            prop: 'type',
            expected: 'supported compiler Pixi node type',
            actual: node.type,
            hint: 'Use GridContainer, HBoxContainer, ScrollContainer, VBoxContainer, Container, Sprite, NineSliceSprite, TilingSprite, Text, BitmapText, HTMLText, Graphics, Rect, Image, NineImage, or TileImage.',
        }];
    }

    const diagnostics: SceneValidationDiagnostic[] = [];
    if (!pixiSceneNodeAcceptsChildren(node.type) && node.children.length > 0) {
        diagnostics.push({
            path,
            prop: 'children',
            expected: 'no child nodes',
            actual: `${node.children.length} ${node.children.length === 1 ? 'child node' : 'child nodes'}`,
            hint: `${node.type} is a leaf drawing node. Wrap it and sibling content in a Container or Group Scene.`,
        });
    }
    const knownProps = new Set<string>([
        ...pixiSceneTransformProps,
        ...pixiSceneLayoutProps,
        ...pixiSceneDisplayProps,
        ...pixiSceneNodePropKeys(node.type),
    ]);
    for (const [prop, value] of Object.entries(node.props)) {
        if (!knownProps.has(prop)) {
            diagnostics.push({
                path,
                prop,
                expected: `known ${node.type} prop`,
                actual: 'unknown prop',
                hint: unknownPixiPropHint(prop),
            });
            continue;
        }

        const schema = pixiSceneFieldSchema(prop);
        if (schema && !sceneValueMatchesFieldType(value, schema.type, schema.options)) {
            diagnostics.push({
                path,
                prop,
                expected: schema.type === 'enum' ? `one of ${schema.options?.map((option) => JSON.stringify(option)).join(', ')}` : schema.type,
                actual: sceneValueType(value),
                hint: `Set ${node.type}.${prop} to ${fieldTypeDescription(schema.type)}.`,
            });
        }
    }

    const texture = node.props.texture;
    if (typeof texture === 'string') {
        const assetDiagnostic = validateTextureReference(path, texture, existingAssets);
        if (assetDiagnostic) {
            diagnostics.push(assetDiagnostic);
        }
    }
    return diagnostics;
}

function validateSceneInstanceNode(
    node: SceneInstanceTemplateNode,
    path: string,
    context: SceneValidationContext,
): SceneValidationDiagnostic[] {
    let scene = node.scene;
    try {
        scene = context.normalizeSceneReference ? context.normalizeSceneReference(node.scene) : node.scene;
    } catch (error) {
        return [{
            path,
            prop: 'scene',
            expected: 'project-relative or relative .scene path',
            actual: node.scene,
            hint: error instanceof Error ? error.message : 'Use a .scene path.',
        }];
    }

    const sceneInterface = context.sceneInterfaces?.[scene];
    if (!sceneInterface) {
        if (context.sceneInterfaces) {
            return [{
                path,
                prop: 'scene',
                expected: 'known compiler Scene contract',
                actual: node.scene,
                hint: 'Ensure the referenced .scene file exists and has a readable paired script.',
            }];
        }
        return [];
    }

    const diagnostics: SceneValidationDiagnostic[] = [];
    const allowedProps = new Set<string>([
        ...pixiSceneTransformProps,
        ...pixiSceneLayoutProps,
        ...pixiSceneDisplayProps,
        ...Object.keys(sceneInterface.props),
    ]);
    for (const [prop, value] of Object.entries(node.props)) {
        if (!allowedProps.has(prop)) {
            diagnostics.push({
                path,
                prop,
                expected: `public prop declared by ${scene}`,
                actual: 'unknown prop',
                hint: 'Expose the property with @prop on the child Scene script before setting it from a parent Scene.',
            });
            continue;
        }

        const schema = pixiSceneFieldSchema(prop);
        const contract = sceneInterface.props[prop];
        if (contract?.type === 'struct') {
            diagnostics.push(...validateSceneInstanceStructProp(node, path, prop, value, contract));
            continue;
        }
        const expectedType = contract?.type ?? schema?.type;
        if (expectedType && !sceneValueMatchesContractType(value, expectedType, schema?.options)) {
            diagnostics.push({
                path,
                prop,
                expected: expectedType,
                actual: sceneValueType(value),
                hint: `Set ${node.type}.${prop} to ${fieldTypeDescription(expectedType)}.`,
            });
        }
    }

    for (const eventName of Object.keys(node.events)) {
        if (!sceneInterface.events[eventName]) {
            diagnostics.push({
                path,
                prop: `@${eventName}`,
                expected: `public event declared by ${scene}`,
                actual: 'unknown event',
                hint: 'Expose the event with @event on the child Scene script before binding it from a parent Scene.',
            });
        }
    }

    for (const slot of Object.keys(node.slots)) {
        if (!sceneInterface.slots[slot]) {
            diagnostics.push({
                path: `${path}/slot:${slot}`,
                prop: 'slot',
                expected: `public slot declared by ${scene}`,
                actual: 'unknown slot',
                hint: 'Expose the slot with @slot on the child Scene script before placing children into it.',
            });
        }
    }

    return diagnostics;
}

function validateSceneInstanceStructProp(
    node: SceneInstanceTemplateNode,
    path: string,
    prop: string,
    value: SceneTemplateValue,
    contract: Extract<SceneTemplatePropContract, { type: 'struct' }>,
): SceneValidationDiagnostic[] {
    if (!value || typeof value !== 'object') {
        return [{
            path,
            prop,
            expected: contract.struct,
            actual: sceneValueType(value),
            hint: `Set ${node.type}.${prop} fields using dot-path attributes such as ${prop}.x="0".`,
        }];
    }
    const diagnostics: SceneValidationDiagnostic[] = [];
    for (const [field, fieldValue] of Object.entries(value)) {
        const fieldContract = contract.fields[field];
        if (!fieldContract) {
            diagnostics.push({
                path,
                prop: `${prop}.${field}`,
                expected: `field declared by ${contract.struct}`,
                actual: 'unknown field',
                hint: `Use one of ${Object.keys(contract.fields).map((name) => JSON.stringify(name)).join(', ')}.`,
            });
            continue;
        }
        if (!sceneValueMatchesContractType(fieldValue, fieldContract.type)) {
            diagnostics.push({
                path,
                prop: `${prop}.${field}`,
                expected: fieldContract.type,
                actual: sceneValueType(fieldValue),
                hint: `Set ${node.type}.${prop}.${field} to ${fieldTypeDescription(fieldContract.type)}.`,
            });
        }
    }
    return diagnostics;
}

function validateTextureReference(
    path: string,
    texture: string,
    existingAssets: ReadonlySet<string> | undefined,
): SceneValidationDiagnostic | undefined {
    if (!isProjectRelativeAssetPath(texture)) {
        return {
            path,
            prop: 'texture',
            expected: 'project-relative asset path inside project root',
            actual: texture,
            hint: 'Use a project-relative path such as "assets/play.png".',
        };
    }
    if (existingAssets && !existingAssets.has(normalizeAssetPath(texture))) {
        return {
            path,
            prop: 'texture',
            expected: 'existing project asset',
            actual: texture,
            hint: 'Use an asset path that exists in the project before validating the scene.',
        };
    }
    return undefined;
}

function isProjectRelativeAssetPath(value: string) {
    if (
        value.trim() === ''
        || value.startsWith('/')
        || value.startsWith('./')
        || value.includes('\\')
        || /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)
    ) {
        return false;
    }
    return !value.split('/').includes('..');
}

function normalizeAssetPath(value: string) {
    return value.split('/').filter((part) => part !== '' && part !== '.').join('/');
}

function sceneValueMatchesFieldType(
    value: SceneTemplateValue,
    type: string,
    options?: readonly (string | number)[],
) {
    if (type === 'enum') {
        return options?.includes(value as string | number) ?? false;
    }
    return sceneValueMatchesContractType(value, type);
}

function sceneValueMatchesContractType(value: SceneTemplateValue, type: string, options?: readonly (string | number)[]) {
    if (type === 'enum') {
        return options?.includes(value as string | number) ?? false;
    }
    if (type === 'number' || type === 'color') {
        return typeof value === 'number';
    }
    if (type === 'boolean') {
        return typeof value === 'boolean';
    }
    return typeof value === 'string';
}

function sceneValueType(value: SceneTemplateValue) {
    if (value && typeof value === 'object') {
        return 'object';
    }
    return typeof value;
}

function fieldTypeDescription(type: string) {
    if (type === 'number') {
        return 'a numeric value';
    }
    if (type === 'color') {
        return 'a color value such as "#ffffff"';
    }
    if (type === 'enum') {
        return 'one of the allowed values';
    }
    return `a ${type} value`;
}

function unknownPixiPropHint(prop: string) {
    if (prop === 'textrue') {
        return 'Use "texture" for Sprite image assets.';
    }
    return 'Use the editor inspector or scene inspect command to list supported props for this node type.';
}

function nodePathSegment(index: number, node: SceneTemplateNode) {
    if (node.kind === 'slotOutlet') {
        return `${index}:slot:${node.name}`;
    }
    return `${index}:${node.id ?? node.kind}`;
}
