import type { SceneTemplate, SceneTemplateNode, SceneTemplateValue } from './spec';
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

function nodePathSegment(index: number, node: SceneTemplateNode) {
    if (node.kind === 'slotOutlet') {
        return `${index}:slot:${node.name}`;
    }
    return `${index}:${node.id ?? node.kind}`;
}
