import type { SceneDocument } from 'pixifact';
import { createInitialDocument } from './createInitialDocument';

const document = createInitialDocument();
const listeners = new Set<() => void>();
let revision = 0;

function emitDocumentUpdate() {
    revision += 1;
    for (const listener of listeners) {
        listener();
    }
}

document.emitter.on('changed', emitDocumentUpdate);
document.emitter.on('loaded', emitDocumentUpdate);
document.emitter.on('previewRebuilt', emitDocumentUpdate);
document.emitter.on('selectionChanged', emitDocumentUpdate);

export function getSceneDocument(): SceneDocument {
    return document;
}

export function getSceneDocumentRevision() {
    return revision;
}

export function subscribeSceneDocument(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function refreshSceneDocument() {
    emitDocumentUpdate();
}

export function resetSceneDocument() {
    const nextDocument = createInitialDocument();
    document.loadState(nextDocument.getState());
    document.dirty = false;
}
