import type { SceneInstanceTemplateNode, SceneTemplate, SceneTemplateInterface, SceneTemplateNode, SceneTemplateValue } from './spec';
import {
    isPixiSceneNodeType,
    pixiSceneFieldSchema,
    pixiSceneNodePropKeys,
    pixiSceneTransformProps,
    pixiSceneDisplayProps,
} from './pixiNodeSchema';
import { parseSceneTemplate } from './templateParser';
import { serializeSceneTemplate } from './templateSerializer';

export interface SceneProposalEnvelope {
    kind: 'pixifact.sceneProposal.v1';
    scene: string;
    baseRevision: string;
    content: string;
}

export interface SceneProposalNodeSummary {
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
    nodes: SceneProposalNodeSummary[];
}

export type SceneProposalDiffEntry =
    | { kind: 'scenePropChanged'; prop: string; before?: SceneTemplateValue; after?: SceneTemplateValue }
    | { kind: 'nodeInserted'; path: string; node: string }
    | { kind: 'nodeDeleted'; path: string; node: string }
    | { kind: 'nodeTypeChanged'; path: string; before: string; after: string }
    | { kind: 'nodePropChanged'; path: string; node: string; prop: string; before?: SceneTemplateValue; after?: SceneTemplateValue }
    | { kind: 'childrenChanged'; path: string; before: string[]; after: string[] };

export interface SceneProposalDiagnostic {
    path: string;
    prop: string;
    expected: string;
    actual: string;
    hint?: string;
    line?: number;
    column?: number;
}

export type SceneProposalCheckResult =
    | {
        ok: true;
        scene: string;
        baseRevision: string;
        nextRevision: string;
        canonicalContent: string;
        current: SceneTemplateInspection;
        proposed: SceneTemplateInspection;
        diffs: SceneProposalDiffEntry[];
    }
    | {
        ok: false;
        scene: string;
        baseRevision?: string;
        currentRevision?: string;
        error: string;
        diagnostics?: SceneProposalDiagnostic[];
        hint?: string;
    };

export function createSceneRevision(source: string) {
    const canonical = serializeSceneTemplate(parseSceneTemplate(source));
    let hash = 0x811c9dc5;
    for (let index = 0; index < canonical.length; index += 1) {
        hash = Math.imul(hash ^ canonical.charCodeAt(index), 0x01000193);
    }
    return `scene:${canonical.length}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function inspectSceneTemplate(template: SceneTemplate): SceneTemplateInspection {
    const nodes: SceneProposalNodeSummary[] = [];

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

export interface CheckSceneProposalOptions {
    currentContent: string;
    proposal: SceneProposalEnvelope;
    existingAssets?: ReadonlySet<string>;
    sceneInterfaces?: Record<string, SceneTemplateInterface>;
    normalizeSceneReference?: (scene: string) => string;
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

export function checkSceneProposal(options: CheckSceneProposalOptions): SceneProposalCheckResult {
    const currentRevision = createSceneRevision(options.currentContent);
    if (options.proposal.baseRevision !== currentRevision) {
        return {
            ok: false,
            scene: options.proposal.scene,
            baseRevision: options.proposal.baseRevision,
            currentRevision,
            error: 'Scene proposal baseRevision does not match current scene revision.',
            hint: 'Re-read the current .scene file and create a new proposal with the current baseRevision.',
        };
    }

    try {
        const currentTemplate = parseSceneTemplate(options.currentContent);
        const proposedTemplate = parseSceneTemplate(options.proposal.content);
        if (currentTemplate.name !== proposedTemplate.name) {
            return {
                ok: false,
                scene: options.proposal.scene,
                baseRevision: options.proposal.baseRevision,
                currentRevision,
                error: `Scene proposal cannot change Scene name from "${currentTemplate.name}" to "${proposedTemplate.name}".`,
                hint: 'Create or rename scenes through a dedicated project operation instead of a scene proposal.',
            };
        }

        const diagnostics = validateSceneTemplateProposal(proposedTemplate, options);
        if (diagnostics.length > 0) {
            return {
                ok: false,
                scene: options.proposal.scene,
                baseRevision: options.proposal.baseRevision,
                currentRevision,
                error: 'Scene proposal validation failed.',
                diagnostics,
                hint: 'Fix the listed diagnostics, then run scene proposal check again.',
            };
        }

        const canonicalContent = serializeSceneTemplate(proposedTemplate);
        return {
            ok: true,
            scene: options.proposal.scene,
            baseRevision: options.proposal.baseRevision,
            nextRevision: createSceneRevision(canonicalContent),
            canonicalContent,
            current: inspectSceneTemplate(currentTemplate),
            proposed: inspectSceneTemplate(proposedTemplate),
            diffs: diffSceneTemplates(currentTemplate, proposedTemplate),
        };
    } catch (error) {
        return {
            ok: false,
            scene: options.proposal.scene,
            baseRevision: options.proposal.baseRevision,
            currentRevision,
            error: error instanceof Error ? error.message : String(error),
        };
    }
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
        diagnostics?: SceneProposalDiagnostic[];
        hint?: string;
    };

export function validateSceneContent(options: ValidateSceneContentOptions): SceneContentValidationResult {
    try {
        const template = parseSceneTemplate(options.content);
        const diagnostics = validateSceneTemplateProposal(template, options);
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

function sceneSourceDiagnostic(source: string, message: string): SceneProposalDiagnostic {
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

export type SceneProposalApplyResult =
    | (Extract<SceneProposalCheckResult, { ok: true }> & { content: string })
    | Extract<SceneProposalCheckResult, { ok: false }>;

export function applySceneProposal(options: CheckSceneProposalOptions): SceneProposalApplyResult {
    const result = checkSceneProposal(options);
    if (!result.ok) {
        return result;
    }
    return {
        ...result,
        content: result.canonicalContent,
    };
}

function validateSceneTemplateProposal(
    template: SceneTemplate,
    context: SceneValidationContext,
): SceneProposalDiagnostic[] {
    return template.children.flatMap((child, index) => validateSceneNodeProposal(
        child,
        nodePathSegment(index, child),
        context,
    ));
}

function validateSceneNodeProposal(
    node: SceneTemplateNode,
    path: string,
    context: SceneValidationContext,
): SceneProposalDiagnostic[] {
    if (node.kind === 'slotOutlet') {
        return [];
    }

    if (node.kind === 'pixi') {
        return [
            ...validatePixiNodeProposal(node, path, context.existingAssets),
            ...node.children.flatMap((child, index) => validateSceneNodeProposal(
                child,
                `${path}/${nodePathSegment(index, child)}`,
                context,
            )),
        ];
    }

    return [
        ...validateSceneInstanceNodeProposal(node, path, context),
        ...Object.entries(node.slots).flatMap(([slot, children]) => children.flatMap((child, index) => validateSceneNodeProposal(
            child,
            `${path}/slot:${slot}/${nodePathSegment(index, child)}`,
            context,
        ))),
    ];
}

function validatePixiNodeProposal(
    node: Exclude<SceneTemplateNode, SceneInstanceTemplateNode | { kind: 'slotOutlet' }>,
    path: string,
    existingAssets: ReadonlySet<string> | undefined,
): SceneProposalDiagnostic[] {
    if (!isPixiSceneNodeType(node.type)) {
        return [{
            path,
            prop: 'type',
            expected: 'supported compiler Pixi node type',
            actual: node.type,
            hint: 'Use Container, Sprite, NineSliceSprite, TilingSprite, Text, BitmapText, HTMLText, or Graphics.',
        }];
    }

    const diagnostics: SceneProposalDiagnostic[] = [];
    const knownProps = new Set<string>([
        ...pixiSceneTransformProps,
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

function validateSceneInstanceNodeProposal(
    node: SceneInstanceTemplateNode,
    path: string,
    context: SceneValidationContext,
): SceneProposalDiagnostic[] {
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

    const diagnostics: SceneProposalDiagnostic[] = [];
    const allowedProps = new Set<string>([
        ...pixiSceneTransformProps,
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

function validateTextureReference(
    path: string,
    texture: string,
    existingAssets: ReadonlySet<string> | undefined,
): SceneProposalDiagnostic | undefined {
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
            hint: 'Use an asset path that exists in the project before applying the proposal.',
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

function diffSceneTemplates(before: SceneTemplate, after: SceneTemplate): SceneProposalDiffEntry[] {
    return [
        ...diffProps(before.props, after.props).map((entry) => ({
            kind: 'scenePropChanged' as const,
            ...entry,
        })),
        ...diffChildren('__scene__', before.children, after.children),
    ];
}

function diffChildren(path: string, before: SceneTemplateNode[], after: SceneTemplateNode[]): SceneProposalDiffEntry[] {
    const diffs: SceneProposalDiffEntry[] = [];
    const max = Math.max(before.length, after.length);
    for (let index = 0; index < max; index += 1) {
        const beforeNode = before[index];
        const afterNode = after[index];
        if (!beforeNode && afterNode) {
            diffs.push({ kind: 'nodeInserted', path: childPath(path, index, afterNode), node: nodeLabel(afterNode) });
            continue;
        }
        if (beforeNode && !afterNode) {
            diffs.push({ kind: 'nodeDeleted', path: childPath(path, index, beforeNode), node: nodeLabel(beforeNode) });
            continue;
        }
        if (beforeNode && afterNode) {
            diffs.push(...diffNode(childPath(path, index, afterNode), beforeNode, afterNode));
        }
    }

    const beforeLabels = before.map(nodeLabel);
    const afterLabels = after.map(nodeLabel);
    if (JSON.stringify(beforeLabels) !== JSON.stringify(afterLabels)) {
        diffs.push({ kind: 'childrenChanged', path, before: beforeLabels, after: afterLabels });
    }
    return diffs;
}

function diffNode(path: string, before: SceneTemplateNode, after: SceneTemplateNode): SceneProposalDiffEntry[] {
    const beforeLabel = nodeLabel(before);
    const afterLabel = nodeLabel(after);
    if (before.kind !== after.kind || nodeType(before) !== nodeType(after)) {
        return [{ kind: 'nodeTypeChanged', path, before: beforeLabel, after: afterLabel }];
    }

    if (before.kind === 'slotOutlet') {
        if (after.kind !== 'slotOutlet') {
            return [{ kind: 'nodeTypeChanged', path, before: beforeLabel, after: afterLabel }];
        }
        return before.name === after.name ? [] : [{
            kind: 'nodePropChanged',
            path,
            node: afterLabel,
            prop: 'name',
            before: before.name,
            after: after.name,
        }];
    }
    if (after.kind === 'slotOutlet') {
        return [{ kind: 'nodeTypeChanged', path, before: beforeLabel, after: afterLabel }];
    }

    const diffs = diffProps(before.props, after.props).map((entry) => ({
        kind: 'nodePropChanged' as const,
        path,
        node: afterLabel,
        ...entry,
    }));

    if (before.kind === 'pixi' && after.kind === 'pixi') {
        return [...diffs, ...diffChildren(path, before.children, after.children)];
    }

    if (before.kind === 'sceneInstance' && after.kind === 'sceneInstance') {
        return [
            ...diffs,
            ...diffProps(before.events, after.events).map((entry) => ({
                kind: 'nodePropChanged' as const,
                path,
                node: afterLabel,
                prop: `@${entry.prop}`,
                before: entry.before,
                after: entry.after,
            })),
            ...diffSceneInstanceSlots(path, before, after),
        ];
    }

    return diffs;
}

function diffSceneInstanceSlots(path: string, before: SceneInstanceTemplateNode, after: SceneInstanceTemplateNode) {
    const diffs: SceneProposalDiffEntry[] = [];
    const slots = new Set([...Object.keys(before.slots), ...Object.keys(after.slots)]);
    for (const slot of [...slots].sort()) {
        diffs.push(...diffChildren(`${path}/slot:${slot}`, before.slots[slot] ?? [], after.slots[slot] ?? []));
    }
    return diffs;
}

function diffProps(before: Record<string, SceneTemplateValue>, after: Record<string, SceneTemplateValue>) {
    const diffs: Array<{ prop: string; before?: SceneTemplateValue; after?: SceneTemplateValue }> = [];
    const props = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const prop of [...props].sort()) {
        if (before[prop] !== after[prop]) {
            diffs.push({ prop, before: before[prop], after: after[prop] });
        }
    }
    return diffs;
}

function nodeLabel(node: SceneTemplateNode) {
    if (node.kind === 'slotOutlet') {
        return `slot:${node.name}`;
    }
    return `${nodeType(node)}${node.id ? `#${node.id}` : ''}`;
}

function nodeType(node: SceneTemplateNode) {
    if (node.kind === 'slotOutlet') return 'slot';
    return node.type;
}

function childPath(parentPath: string, index: number, node: SceneTemplateNode) {
    const segment = nodePathSegment(index, node);
    return parentPath === '__scene__' ? segment : `${parentPath}/${segment}`;
}

function nodePathSegment(index: number, node: SceneTemplateNode) {
    if (node.kind === 'slotOutlet') {
        return `${index}:slot:${node.name}`;
    }
    return `${index}:${node.id ?? node.kind}`;
}
