import { beforeEach, describe, expect, it } from 'vitest';
import {
    editorUiStorageKey,
    useEditorStore,
} from '../apps/editor/src/editorStore';

describe('editor UI store', () => {
    beforeEach(() => {
        localStorage.clear();
        useEditorStore.setState({
            language: 'zh-CN',
        });
    });

    it('persists only lightweight UI preferences', () => {
        useEditorStore.getState().setLanguage('en-US');

        const raw = localStorage.getItem(editorUiStorageKey);

        expect(raw).toContain('en-US');
        expect(raw).not.toContain('secret.example.test');
        expect(raw).not.toContain('Authorization');
    });
});
