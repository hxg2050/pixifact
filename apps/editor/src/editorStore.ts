import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type RightPanel = 'inspector' | 'ai' | 'components' | 'actions' | 'logic' | 'memory' | 'project';
export type LeftPanel = 'hierarchy' | 'assets';
export type AiProviderMode = 'mock' | 'remote';
export const editorRemoteConfigStorageKey = 'pixif.editor.remoteConfig.v1';
const defaultRemoteEndpoint = 'http://localhost:8788/proposal';
const defaultRemoteAuthHeader = 'Authorization';
const defaultRemoteAuthToken = 'Bearer local-test';
const defaultRemoteTimeoutMs = 300000;
const defaultRemoteModelApi = 'responses';
const defaultRemoteModelEndpoint = 'https://code.ylsagi.com/codex/v1/responses';
const defaultRemoteModelName = 'gpt-5.5';
const defaultRemoteModelTimeoutMs = 300000;
const defaultRemoteModelReasoningEffort = 'medium';
const defaultRemoteModelServiceTier = 'fast';

export interface EditorUiState {
    leftPanel: LeftPanel;
    rightPanel: RightPanel;
    providerMode: AiProviderMode;
    remoteEndpoint: string;
    remoteTimeoutMs: number;
    remoteAuthHeader: string;
    remoteAuthToken: string;
    remoteModelApi: 'chatCompletions' | 'responses';
    remoteModelEndpoint: string;
    remoteModelName: string;
    remoteModelTimeoutMs: number;
    remoteModelAuthHeader: string;
    remoteModelAuthPrefix: string;
    remoteModelToken: string;
    remoteModelTemperature: number;
    remoteModelReasoningEffort: string;
    remoteModelServiceTier: string;
    remoteModelStore: boolean;
    prompt: string;
    setLeftPanel(panel: LeftPanel): void;
    setRightPanel(panel: RightPanel): void;
    setProviderMode(mode: AiProviderMode): void;
    setRemoteEndpoint(endpoint: string): void;
    setRemoteTimeoutMs(timeoutMs: number): void;
    setRemoteAuthHeader(header: string): void;
    setRemoteAuthToken(token: string): void;
    setRemoteModelApi(api: 'chatCompletions' | 'responses'): void;
    setRemoteModelEndpoint(endpoint: string): void;
    setRemoteModelName(model: string): void;
    setRemoteModelTimeoutMs(timeoutMs: number): void;
    setRemoteModelAuthHeader(header: string): void;
    setRemoteModelAuthPrefix(prefix: string): void;
    setRemoteModelToken(token: string): void;
    setRemoteModelTemperature(temperature: number): void;
    setRemoteModelReasoningEffort(effort: string): void;
    setRemoteModelServiceTier(serviceTier: string): void;
    setRemoteModelStore(store: boolean): void;
    setPrompt(prompt: string): void;
}

export const useEditorStore = create<EditorUiState>()(
    persist(
        (set) => ({
            leftPanel: 'hierarchy',
            rightPanel: 'inspector',
            providerMode: 'mock',
            remoteEndpoint: defaultRemoteEndpoint,
            remoteTimeoutMs: defaultRemoteTimeoutMs,
            remoteAuthHeader: defaultRemoteAuthHeader,
            remoteAuthToken: defaultRemoteAuthToken,
            remoteModelApi: defaultRemoteModelApi,
            remoteModelEndpoint: defaultRemoteModelEndpoint,
            remoteModelName: defaultRemoteModelName,
            remoteModelTimeoutMs: defaultRemoteModelTimeoutMs,
            remoteModelAuthHeader: 'authorization',
            remoteModelAuthPrefix: 'Bearer',
            remoteModelToken: '',
            remoteModelTemperature: 1,
            remoteModelReasoningEffort: defaultRemoteModelReasoningEffort,
            remoteModelServiceTier: defaultRemoteModelServiceTier,
            remoteModelStore: false,
            prompt: '创建一个背包界面，四列三行，每个格子有图标、数量和 Use 按钮。',
            setLeftPanel: (leftPanel) => set({ leftPanel }),
            setRightPanel: (rightPanel) => set({ rightPanel }),
            setProviderMode: (providerMode) => set({ providerMode }),
            setRemoteEndpoint: (remoteEndpoint) => set({ remoteEndpoint }),
            setRemoteTimeoutMs: (remoteTimeoutMs) => set({ remoteTimeoutMs }),
            setRemoteAuthHeader: (remoteAuthHeader) => set({ remoteAuthHeader }),
            setRemoteAuthToken: (remoteAuthToken) => set({ remoteAuthToken }),
            setRemoteModelApi: (remoteModelApi) => set({ remoteModelApi }),
            setRemoteModelEndpoint: (remoteModelEndpoint) => set({ remoteModelEndpoint }),
            setRemoteModelName: (remoteModelName) => set({ remoteModelName }),
            setRemoteModelTimeoutMs: (remoteModelTimeoutMs) => set({ remoteModelTimeoutMs }),
            setRemoteModelAuthHeader: (remoteModelAuthHeader) => set({ remoteModelAuthHeader }),
            setRemoteModelAuthPrefix: (remoteModelAuthPrefix) => set({ remoteModelAuthPrefix }),
            setRemoteModelToken: (remoteModelToken) => set({ remoteModelToken }),
            setRemoteModelTemperature: (remoteModelTemperature) => set({ remoteModelTemperature }),
            setRemoteModelReasoningEffort: (remoteModelReasoningEffort) => set({ remoteModelReasoningEffort }),
            setRemoteModelServiceTier: (remoteModelServiceTier) => set({ remoteModelServiceTier }),
            setRemoteModelStore: (remoteModelStore) => set({ remoteModelStore }),
            setPrompt: (prompt) => set({ prompt }),
        }),
        {
            name: editorRemoteConfigStorageKey,
            merge: (persisted, current) => {
                const saved = (persisted && typeof persisted === 'object' && 'state' in persisted
                    ? (persisted as { state?: Partial<EditorUiState> }).state
                    : persisted) as Partial<EditorUiState> | undefined;
                if (!saved) {
                    return current;
                }

                const hasUserModelEndpoint = !!saved.remoteModelEndpoint
                    && !saved.remoteModelEndpoint.includes('model.example.test');

                return {
                    ...current,
                    ...saved,
                    remoteEndpoint: saved.remoteEndpoint === 'http://localhost:8787/proposal'
                        ? defaultRemoteEndpoint
                        : saved.remoteEndpoint ?? current.remoteEndpoint,
                    remoteTimeoutMs: !saved.remoteTimeoutMs || saved.remoteTimeoutMs <= 120000
                        ? defaultRemoteTimeoutMs
                        : saved.remoteTimeoutMs,
                    remoteAuthHeader: saved.remoteAuthHeader || defaultRemoteAuthHeader,
                    remoteAuthToken: defaultRemoteAuthToken,
                    remoteModelApi: hasUserModelEndpoint
                        ? saved.remoteModelApi ?? current.remoteModelApi
                        : defaultRemoteModelApi,
                    remoteModelEndpoint: hasUserModelEndpoint
                        ? saved.remoteModelEndpoint ?? current.remoteModelEndpoint
                        : defaultRemoteModelEndpoint,
                    remoteModelName: hasUserModelEndpoint
                        ? saved.remoteModelName ?? current.remoteModelName
                        : defaultRemoteModelName,
                    remoteModelTimeoutMs: !saved.remoteModelTimeoutMs || saved.remoteModelTimeoutMs <= 120000
                        ? defaultRemoteModelTimeoutMs
                        : saved.remoteModelTimeoutMs,
                    remoteModelReasoningEffort: hasUserModelEndpoint
                        ? saved.remoteModelReasoningEffort === 'xhigh'
                            ? defaultRemoteModelReasoningEffort
                            : saved.remoteModelReasoningEffort ?? current.remoteModelReasoningEffort
                        : defaultRemoteModelReasoningEffort,
                    remoteModelServiceTier: hasUserModelEndpoint
                        ? saved.remoteModelServiceTier ?? current.remoteModelServiceTier
                        : defaultRemoteModelServiceTier,
                    remoteModelStore: hasUserModelEndpoint
                        ? saved.remoteModelStore ?? current.remoteModelStore
                        : false,
                    remoteModelToken: '',
                };
            },
            partialize: (state) => ({
                remoteEndpoint: state.remoteEndpoint,
                remoteTimeoutMs: state.remoteTimeoutMs,
                remoteAuthHeader: state.remoteAuthHeader,
                remoteModelApi: state.remoteModelApi,
                remoteModelEndpoint: state.remoteModelEndpoint,
                remoteModelName: state.remoteModelName,
                remoteModelTimeoutMs: state.remoteModelTimeoutMs,
                remoteModelAuthHeader: state.remoteModelAuthHeader,
                remoteModelAuthPrefix: state.remoteModelAuthPrefix,
                remoteModelTemperature: state.remoteModelTemperature,
                remoteModelReasoningEffort: state.remoteModelReasoningEffort,
                remoteModelServiceTier: state.remoteModelServiceTier,
                remoteModelStore: state.remoteModelStore,
            }),
        },
    ),
);
