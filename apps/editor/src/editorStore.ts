import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
    collectFolderPaths,
    mergeExpandedFolderPaths,
    nearestExistingPath,
} from './services/projectFileTree';
import type { ProjectFileTreeNode } from './services/projectFileTree';
import type { EditorLanguage } from './i18n';

export type AiProviderMode = 'mock' | 'remote';
export const editorRemoteConfigStorageKey = 'pixifact.editor.remoteConfig.v1';
export const defaultEditorLanguage: EditorLanguage = 'zh-CN';
const defaultRemoteEndpoint = 'http://localhost:8788/proposal';
const defaultRemoteAuthHeader = 'Authorization';
const defaultRemoteAuthToken = 'Bearer local-test';
const defaultRemoteTimeoutMs = 300000;

export interface EditorUiState {
    language: EditorLanguage;
    projectName: string;
    projectTree?: ProjectFileTreeNode;
    selectedProjectFilePath?: string;
    openedPrefabPath?: string;
    expandedProjectFolders: string[];
    providerMode: AiProviderMode;
    remoteEndpoint: string;
    remoteTimeoutMs: number;
    remoteAuthHeader: string;
    remoteAuthToken: string;
    prompt: string;
    setLanguage(language: EditorLanguage): void;
    setProject(tree: ProjectFileTreeNode): void;
    refreshProject(tree: ProjectFileTreeNode, options?: { selectPath?: string; expandPaths?: string[] }): void;
    setSelectedProjectFile(path: string): void;
    setOpenedPrefab(path: string): void;
    setExpandedProjectFolders(paths: string[]): void;
    setProviderMode(mode: AiProviderMode): void;
    setRemoteEndpoint(endpoint: string): void;
    setRemoteTimeoutMs(timeoutMs: number): void;
    setPrompt(prompt: string): void;
}

export const useEditorStore = create<EditorUiState>()(
    persist(
        (set) => ({
            language: defaultEditorLanguage,
            projectName: '模拟项目',
            projectTree: undefined,
            selectedProjectFilePath: undefined,
            openedPrefabPath: undefined,
            expandedProjectFolders: [],
            providerMode: 'mock',
            remoteEndpoint: defaultRemoteEndpoint,
            remoteTimeoutMs: defaultRemoteTimeoutMs,
            remoteAuthHeader: defaultRemoteAuthHeader,
            remoteAuthToken: defaultRemoteAuthToken,
            prompt: '创建一个背包界面，四列三行，每个格子有图标、数量和 Use 按钮。',
            setLanguage: (language) => set({ language }),
            setProject: (projectTree) => set({
                projectName: projectTree.name,
                projectTree,
                selectedProjectFilePath: projectTree.path,
                openedPrefabPath: undefined,
                expandedProjectFolders: collectFolderPaths(projectTree),
            }),
            refreshProject: (projectTree, options) => set((state) => ({
                projectName: projectTree.name,
                projectTree,
                selectedProjectFilePath: nearestExistingPath(projectTree, options?.selectPath ?? state.selectedProjectFilePath),
                openedPrefabPath: state.openedPrefabPath && nearestExistingPath(projectTree, state.openedPrefabPath) === state.openedPrefabPath
                    ? state.openedPrefabPath
                    : undefined,
                expandedProjectFolders: mergeExpandedFolderPaths(
                    projectTree,
                    state.expandedProjectFolders,
                    options?.expandPaths,
                ),
            })),
            setSelectedProjectFile: (selectedProjectFilePath) => set({ selectedProjectFilePath }),
            setOpenedPrefab: (openedPrefabPath) => set({ openedPrefabPath, selectedProjectFilePath: openedPrefabPath }),
            setExpandedProjectFolders: (expandedProjectFolders) => set({ expandedProjectFolders }),
            setProviderMode: (providerMode) => set({ providerMode }),
            setRemoteEndpoint: (remoteEndpoint) => set({ remoteEndpoint }),
            setRemoteTimeoutMs: (remoteTimeoutMs) => set({ remoteTimeoutMs }),
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

                return {
                    ...current,
                    language: saved.language ?? current.language,
                    providerMode: saved.providerMode ?? current.providerMode,
                    remoteEndpoint: saved.remoteEndpoint === 'http://localhost:8787/proposal'
                        ? defaultRemoteEndpoint
                        : saved.remoteEndpoint ?? current.remoteEndpoint,
                    remoteTimeoutMs: !saved.remoteTimeoutMs || saved.remoteTimeoutMs <= 120000
                        ? defaultRemoteTimeoutMs
                        : saved.remoteTimeoutMs,
                    remoteAuthHeader: saved.remoteAuthHeader || defaultRemoteAuthHeader,
                    remoteAuthToken: defaultRemoteAuthToken,
                };
            },
            partialize: (state) => ({
                providerMode: state.providerMode,
                language: state.language,
                remoteEndpoint: state.remoteEndpoint,
                remoteTimeoutMs: state.remoteTimeoutMs,
                remoteAuthHeader: state.remoteAuthHeader,
            }),
        },
    ),
);
