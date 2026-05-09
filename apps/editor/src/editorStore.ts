import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
    collectFolderPaths,
    mergeExpandedFolderPaths,
    nearestExistingPath,
} from './services/projectFileTree';
import type { ProjectFileTreeNode } from './services/projectFileTree';
import type { EditorLanguage } from './i18n';

export const editorRemoteConfigStorageKey = 'pixifact.editor.uiConfig.v1';
export const defaultEditorLanguage: EditorLanguage = 'zh-CN';

export interface EditorUiState {
    language: EditorLanguage;
    projectName: string;
    projectTree?: ProjectFileTreeNode;
    selectedProjectFilePath?: string;
    openedScenePath?: string;
    expandedProjectFolders: string[];
    expandedHierarchyNodesByScene: Record<string, string[]>;
    prompt: string;
    setLanguage(language: EditorLanguage): void;
    setProject(tree: ProjectFileTreeNode): void;
    refreshProject(tree: ProjectFileTreeNode, options?: { selectPath?: string; expandPaths?: string[] }): void;
    setSelectedProjectFile(path: string): void;
    setOpenedScene(path: string): void;
    setExpandedProjectFolders(paths: string[]): void;
    setExpandedHierarchyNodes(scenePath: string, paths: string[]): void;
    setPrompt(prompt: string): void;
}

export const useEditorStore = create<EditorUiState>()(
    persist(
        (set) => ({
            language: defaultEditorLanguage,
            projectName: '模拟项目',
            projectTree: undefined,
            selectedProjectFilePath: undefined,
            openedScenePath: undefined,
            expandedProjectFolders: [],
            expandedHierarchyNodesByScene: {},
            prompt: '创建一个背包界面，四列三行，每个格子有图标、数量和 Use 按钮。',
            setLanguage: (language) => set({ language }),
            setProject: (projectTree) => set({
                projectName: projectTree.name,
                projectTree,
                selectedProjectFilePath: projectTree.path,
                openedScenePath: undefined,
                expandedProjectFolders: collectFolderPaths(projectTree),
            }),
            refreshProject: (projectTree, options) => set((state) => ({
                projectName: projectTree.name,
                projectTree,
                selectedProjectFilePath: nearestExistingPath(projectTree, options?.selectPath ?? state.selectedProjectFilePath),
                openedScenePath: state.openedScenePath && nearestExistingPath(projectTree, state.openedScenePath) === state.openedScenePath
                    ? state.openedScenePath
                    : undefined,
                expandedProjectFolders: mergeExpandedFolderPaths(
                    projectTree,
                    state.expandedProjectFolders,
                    options?.expandPaths,
                ),
            })),
            setSelectedProjectFile: (selectedProjectFilePath) => set({ selectedProjectFilePath }),
            setOpenedScene: (openedScenePath) => set({ openedScenePath, selectedProjectFilePath: openedScenePath }),
            setExpandedProjectFolders: (expandedProjectFolders) => set({ expandedProjectFolders }),
            setExpandedHierarchyNodes: (scenePath, expandedHierarchyNodes) => set((state) => ({
                expandedHierarchyNodesByScene: {
                    ...state.expandedHierarchyNodesByScene,
                    [scenePath]: expandedHierarchyNodes,
                },
            })),
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
                };
            },
            partialize: (state) => ({
                language: state.language,
            }),
        },
    ),
);
