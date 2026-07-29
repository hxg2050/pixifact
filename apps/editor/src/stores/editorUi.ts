import { defineStore } from 'pinia';
import type { SceneDocumentSyncState } from '../document/SceneDocument';

export const useEditorUiStore = defineStore('editorUi', {
    state: () => ({
        activeLeftTab: 'hierarchy' as 'hierarchy' | 'assets',
        currentScenePath: undefined as string | undefined,
        selectedLocator: undefined as string | undefined,
        syncState: 'synced' as SceneDocumentSyncState,
    }),
});
