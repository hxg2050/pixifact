import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SerializedDockview } from 'dockview-react';
import {
    collectFolderPaths,
    findFileByPath,
    mergeExpandedFolderPaths,
    nearestExistingPath,
} from './services/projectFileTree';
import type { ProjectFileTreeNode } from './services/projectFileTree';
import type { EditorLanguage } from './i18n';

export const editorUiStorageKey = 'pixifact.editor.uiConfig.v1';
export const editorProjectLayoutStorageKeyPrefix = 'pixifact.editor.projectLayout.v1';
export const defaultEditorLanguage: EditorLanguage = 'zh-CN';
const defaultProjectFolderExpandedMaxDepth = 1;

export interface EditorProjectLayoutState {
    version: 1;
    dockview?: SerializedDockview;
    selectedProjectFilePath?: string;
    openedScenePath?: string;
    expandedProjectFolders?: string[];
    expandedHierarchyNodesByScene?: Record<string, string[]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringArray(value: unknown) {
    return Array.isArray(value) && value.every((item) => typeof item === 'string')
        ? value
        : undefined;
}

function stringArrayRecord(value: unknown) {
    if (!isRecord(value)) {
        return undefined;
    }

    const result: Record<string, string[]> = {};
    for (const [key, item] of Object.entries(value)) {
        const list = stringArray(item);
        if (list) {
            result[key] = list;
        }
    }
    return result;
}

function projectLayoutIdentity(projectTree: ProjectFileTreeNode) {
    return projectTree.projectRootPath ?? projectTree.systemPath ?? projectTree.path;
}

export function editorProjectLayoutStorageKey(projectTree: ProjectFileTreeNode) {
    return `${editorProjectLayoutStorageKeyPrefix}:${projectLayoutIdentity(projectTree)}`;
}

export function readEditorProjectLayoutState(projectTree: ProjectFileTreeNode): EditorProjectLayoutState | undefined {
    const raw = localStorage.getItem(editorProjectLayoutStorageKey(projectTree));
    if (!raw) {
        return undefined;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return undefined;
    }
    if (!isRecord(parsed) || parsed.version !== 1) {
        return undefined;
    }

    return {
        version: 1,
        dockview: isRecord(parsed.dockview) ? parsed.dockview as unknown as SerializedDockview : undefined,
        selectedProjectFilePath: typeof parsed.selectedProjectFilePath === 'string'
            ? parsed.selectedProjectFilePath
            : undefined,
        openedScenePath: typeof parsed.openedScenePath === 'string' ? parsed.openedScenePath : undefined,
        expandedProjectFolders: stringArray(parsed.expandedProjectFolders),
        expandedHierarchyNodesByScene: stringArrayRecord(parsed.expandedHierarchyNodesByScene),
    };
}

export function writeEditorProjectLayoutState(
    projectTree: ProjectFileTreeNode,
    state: Partial<Omit<EditorProjectLayoutState, 'version'>>,
) {
    const current = readEditorProjectLayoutState(projectTree) ?? { version: 1 as const };
    localStorage.setItem(editorProjectLayoutStorageKey(projectTree), JSON.stringify({
        ...current,
        ...state,
        version: 1,
    }));
}

function restoredOpenedScenePath(projectTree: ProjectFileTreeNode, path?: string) {
    if (!path) {
        return undefined;
    }
    const file = findFileByPath(projectTree, path);
    return file?.kind === 'scene' ? file.path : undefined;
}

export interface EditorUiState {
    language: EditorLanguage;
    projectName: string;
    projectTree?: ProjectFileTreeNode;
    selectedProjectFilePath?: string;
    openedScenePath?: string;
    expandedProjectFolders: string[];
    expandedHierarchyNodesByScene: Record<string, string[]>;
    setLanguage(language: EditorLanguage): void;
    setProject(tree: ProjectFileTreeNode): void;
    refreshProject(tree: ProjectFileTreeNode, options?: { selectPath?: string; expandPaths?: string[] }): void;
    setSelectedProjectFile(path: string): void;
    setOpenedScene(path: string): void;
    setExpandedProjectFolders(paths: string[]): void;
    setExpandedHierarchyNodes(scenePath: string, paths: string[]): void;
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
            setLanguage: (language) => set({ language }),
            setProject: (projectTree) => set(() => {
                const saved = readEditorProjectLayoutState(projectTree);
                return {
                    projectName: projectTree.name,
                    projectTree,
                    selectedProjectFilePath: nearestExistingPath(projectTree, saved?.selectedProjectFilePath),
                    openedScenePath: restoredOpenedScenePath(projectTree, saved?.openedScenePath),
                    expandedProjectFolders: saved?.expandedProjectFolders
                        ? mergeExpandedFolderPaths(projectTree, saved.expandedProjectFolders)
                        : collectFolderPaths(projectTree, defaultProjectFolderExpandedMaxDepth),
                    expandedHierarchyNodesByScene: saved?.expandedHierarchyNodesByScene ?? {},
                };
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
        }),
        {
            name: editorUiStorageKey,
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
