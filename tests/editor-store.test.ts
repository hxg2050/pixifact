import { beforeEach, describe, expect, it } from 'vitest';
import {
    editorRemoteConfigStorageKey,
    useEditorStore,
} from '../apps/editor/src/editorStore';

describe('editor UI store', () => {
    beforeEach(() => {
        localStorage.clear();
        useEditorStore.setState({
            prompt: '创建一个背包界面，四列三行，每个格子有图标、数量和 Use 按钮。',
            language: 'zh-CN',
        });
    });

    it('persists only lightweight UI preferences', () => {
        useEditorStore.getState().setLanguage('en-US');
        useEditorStore.getState().setPrompt('do not persist prompt');

        const raw = localStorage.getItem(editorRemoteConfigStorageKey);

        expect(raw).toContain('en-US');
        expect(raw).not.toContain('gateway.example.test');
        expect(raw).not.toContain('Authorization');
        expect(raw).not.toContain('do not persist prompt');
    });
});
