import { defineStore } from 'pinia';
import type { SceneDocumentSyncState } from '../document/SceneDocument';

export const useEditorUiStore = defineStore('editorUi', {
    state: () => ({
        currentScenePath: undefined as string | undefined,
        selectedLocator: undefined as string | undefined,
        syncState: 'synced' as SceneDocumentSyncState,
    }),
});
