import type { SceneInstanceTemplateNode, SceneTemplate, SceneTemplateNode, SceneTemplateValue } from './spec';
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
    script?: string;
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
        ...(template.script ? { script: template.script.path } : {}),
        props: template.props,
        nodeCount: nodes.length,
        nodes,
    };
}

export interface CheckSceneProposalOptions {
    currentContent: string;
    proposal: SceneProposalEnvelope;
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

    if (before.kind === 'slotOutlet' || after.kind === 'slotOutlet') {
        return before.name === after.name ? [] : [{
            kind: 'nodePropChanged',
            path,
            node: afterLabel,
            prop: 'name',
            before: before.name,
            after: after.name,
        }];
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
