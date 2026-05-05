import { beforeEach, describe, expect, it } from 'vitest';
import {
    editorRemoteConfigStorageKey,
    useEditorStore,
} from '../apps/editor/src/editorStore';

describe('editor UI store', () => {
    beforeEach(() => {
        localStorage.clear();
        useEditorStore.setState({
            leftPanel: 'hierarchy',
            rightPanel: 'inspector',
            providerMode: 'mock',
            remoteEndpoint: 'http://localhost:8788/proposal',
            remoteTimeoutMs: 300000,
            remoteAuthHeader: 'Authorization',
            remoteAuthToken: 'Bearer local-test',
            remoteModelApi: 'responses',
            remoteModelEndpoint: 'https://code.ylsagi.com/codex/v1/responses',
            remoteModelName: 'gpt-5.5',
            remoteModelTimeoutMs: 300000,
            remoteModelAuthHeader: 'authorization',
            remoteModelAuthPrefix: 'Bearer',
            remoteModelToken: '',
            remoteModelTemperature: 1,
            remoteModelReasoningEffort: 'medium',
            remoteModelServiceTier: 'fast',
            remoteModelStore: false,
            prompt: '创建一个背包界面，四列三行，每个格子有图标、数量和 Use 按钮。',
        });
    });

    it('persists only non-sensitive remote provider config', () => {
        useEditorStore.getState().setLeftPanel('assets');
        useEditorStore.getState().setRemoteEndpoint('https://gateway.example.test/proposal');
        useEditorStore.getState().setRemoteTimeoutMs(9000);
        useEditorStore.getState().setRemoteAuthHeader('Authorization');
        useEditorStore.getState().setRemoteAuthToken('Bearer secret-token');
        useEditorStore.getState().setRemoteModelApi('responses');
        useEditorStore.getState().setRemoteModelEndpoint('https://model.example.test/v1/chat/completions');
        useEditorStore.getState().setRemoteModelName('model-x');
        useEditorStore.getState().setRemoteModelTimeoutMs(30000);
        useEditorStore.getState().setRemoteModelAuthHeader('authorization');
        useEditorStore.getState().setRemoteModelAuthPrefix('Bearer');
        useEditorStore.getState().setRemoteModelTemperature(0.2);
        useEditorStore.getState().setRemoteModelReasoningEffort('medium');
        useEditorStore.getState().setRemoteModelServiceTier('fast');
        useEditorStore.getState().setRemoteModelStore(false);
        useEditorStore.getState().setRemoteModelToken('upstream-secret-token');
        useEditorStore.getState().setPrompt('do not persist prompt');

        const raw = localStorage.getItem(editorRemoteConfigStorageKey);

        expect(raw).toContain('https://gateway.example.test/proposal');
        expect(raw).toContain('https://model.example.test/v1/chat/completions');
        expect(raw).toContain('model-x');
        expect(raw).toContain('responses');
        expect(raw).toContain('medium');
        expect(raw).toContain('fast');
        expect(raw).toContain('9000');
        expect(raw).toContain('Authorization');
        expect(raw).not.toContain('Bearer secret-token');
        expect(raw).not.toContain('upstream-secret-token');
        expect(raw).not.toContain('do not persist prompt');
        expect(raw).not.toContain('assets');
    });
});
