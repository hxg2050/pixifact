import type { SceneTemplate, SceneTemplateValue } from '../../../../packages/pixifact/src/compiler/spec';
import type {
    CompilerSceneScriptInterface,
    CompilerSceneTemplateNode,
} from '../services/projectFileTree';

export type CompilerSceneSelection =
    | { type: 'scene' }
    | { type: 'node'; node: string };

export interface CompilerSceneDocument {
    scenePath: string;
    template: SceneTemplate;
    descriptor?: CompilerSceneScriptInterface;
    selection: CompilerSceneSelection;
}

const listeners = new Set<() => void>();
let revision = 0;
let document: CompilerSceneDocument | undefined;

function emitCompilerSceneUpdate() {
    revision += 1;
    for (const listener of listeners) {
        listener();
    }
}

export function getCompilerSceneDocument() {
    return document;
}

export function getCompilerSceneDocumentRevision() {
    return revision;
}

export function subscribeCompilerSceneDocument(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function loadCompilerSceneDocument(next: Omit<CompilerSceneDocument, 'selection'>) {
    document = {
        ...next,
        selection: { type: 'scene' },
    };
    emitCompilerSceneUpdate();
}

export function closeCompilerSceneDocument() {
    document = undefined;
    emitCompilerSceneUpdate();
}

export function resetCompilerSceneDocument() {
    closeCompilerSceneDocument();
}

export function selectCompilerSceneNode(node: string) {
    if (!document) {
        return;
    }
    document = {
        ...document,
        selection: { type: 'node', node },
    };
    emitCompilerSceneUpdate();
}

export function updateCompilerSceneNode(locator: string, updates: { id?: string; props?: Record<string, SceneTemplateValue | undefined> }) {
    if (!document) {
        return;
    }
    const template = structuredClone(document.template);
    const updated = updateCompilerSceneNodes(template.children, locator, updates);
    if (!updated) {
        return;
    }
    document = {
        ...document,
        template,
        selection: updates.id !== undefined
            ? { type: 'node', node: updated.locator }
            : document.selection,
    };
    emitCompilerSceneUpdate();
}

export function compilerSceneNodeLocator(node: CompilerSceneTemplateNode, path = '') {
    const suffix = node.kind === 'slotOutlet'
        ? `slot:${node.name}`
        : node.id ?? (node.kind === 'sceneInstance' ? `${node.type}:${node.scene}` : node.type);
    if (path) {
        return `${path}:${suffix}`;
    }
    if (node.kind === 'slotOutlet') {
        return suffix;
    }
    return suffix;
}

function updateCompilerSceneNodes(
    nodes: CompilerSceneTemplateNode[],
    locator: string,
    updates: { id?: string; props?: Record<string, SceneTemplateValue | undefined> },
    path = '',
): { locator: string } | undefined {
    for (const [index, node] of nodes.entries()) {
        const nodePath = path ? `${path}/${index}` : String(index);
        const nodeLocator = compilerSceneNodeLocator(node, nodePath);
        if (nodeLocator === locator) {
            updateCompilerSceneNodeData(node, updates);
            return { locator: compilerSceneNodeLocator(node, nodePath) };
        }
        if (node.kind === 'pixi') {
            const updated = updateCompilerSceneNodes(node.children, locator, updates, nodeLocator);
            if (updated) {
                return updated;
            }
        }
        if (node.kind === 'sceneInstance') {
            for (const [slot, children] of Object.entries(node.slots)) {
                const updated = updateCompilerSceneNodes(children, locator, updates, `${nodeLocator}/slot:${slot}`);
                if (updated) {
                    return updated;
                }
            }
        }
    }
    return undefined;
}

function updateCompilerSceneNodeData(
    node: CompilerSceneTemplateNode,
    updates: { id?: string; props?: Record<string, SceneTemplateValue | undefined> },
) {
    if (node.kind === 'slotOutlet') {
        return;
    }
    if (updates.id !== undefined) {
        node.id = updates.id.trim() || undefined;
    }
    for (const [key, value] of Object.entries(updates.props ?? {})) {
        if (value === undefined) {
            delete node.props[key];
        } else {
            node.props[key] = value;
        }
    }
}
