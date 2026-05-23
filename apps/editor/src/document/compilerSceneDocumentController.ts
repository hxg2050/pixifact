import type { SceneTemplate } from '../../../../packages/pixifact/src/compiler/spec';
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
