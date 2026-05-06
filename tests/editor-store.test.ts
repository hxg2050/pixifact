import { beforeEach, describe, expect, it } from 'vitest';
import {
    editorRemoteConfigStorageKey,
    useEditorStore,
} from '../apps/editor/src/editorStore';

describe('editor UI store', () => {
    beforeEach(() => {
        localStorage.clear();
        useEditorStore.setState({
            providerMode: 'mock',
            remoteEndpoint: 'http://localhost:8788/proposal',
            remoteTimeoutMs: 300000,
            remoteAuthHeader: 'Authorization',
            remoteAuthToken: 'Bearer local-test',
            prompt: '创建一个背包界面，四列三行，每个格子有图标、数量和 Use 按钮。',
        });
    });

    it('persists only simple non-sensitive remote provider config', () => {
        useEditorStore.getState().setProviderMode('remote');
        useEditorStore.getState().setRemoteEndpoint('https://gateway.example.test/proposal');
        useEditorStore.getState().setRemoteTimeoutMs(9000);
        useEditorStore.getState().setPrompt('do not persist prompt');

        const raw = localStorage.getItem(editorRemoteConfigStorageKey);

        expect(raw).toContain('https://gateway.example.test/proposal');
        expect(raw).toContain('remote');
        expect(raw).toContain('9000');
        expect(raw).toContain('Authorization');
        expect(raw).not.toContain('Bearer local-test');
        expect(raw).not.toContain('do not persist prompt');
    });
});
