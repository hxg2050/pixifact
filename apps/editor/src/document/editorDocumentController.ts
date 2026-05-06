import type { EditorDocument } from '../../../../src';
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

export function getEditorDocument(): EditorDocument {
    return document;
}

export function getEditorDocumentRevision() {
    return revision;
}

export function subscribeEditorDocument(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function refreshEditorDocument() {
    emitDocumentUpdate();
}

export function resetEditorDocument() {
    const nextDocument = createInitialDocument();
    document.loadState(nextDocument.getState());
    document.dirty = false;
}
