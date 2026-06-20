import { beforeEach, describe, expect, it } from 'vitest';
import {
    editorProjectLayoutStorageKey,
    editorUiStorageKey,
    useEditorStore,
    writeEditorProjectLayoutState,
} from '../apps/editor/src/editorStore';
import type { ProjectFileTreeNode } from '../apps/editor/src/services/projectFileTree';

function folder(path: string, depth: number, children: ProjectFileTreeNode[] = []): ProjectFileTreeNode {
    return {
        id: path,
        name: path.split('/').pop() ?? path,
        path,
        kind: 'folder',
        depth,
        children,
    };
}

function file(path: string, depth: number, kind: ProjectFileTreeNode['kind']): ProjectFileTreeNode {
    return {
        id: path,
        name: path.split('/').pop() ?? path,
        path,
        kind,
        depth,
    };
}

describe('editor UI store', () => {
    beforeEach(() => {
        localStorage.clear();
        useEditorStore.setState({
            language: 'zh-CN',
            projectName: '模拟项目',
            projectTree: undefined,
            selectedProjectFilePath: undefined,
            openedScenePath: undefined,
            expandedProjectFolders: [],
            expandedHierarchyNodesByScene: {},
        });
    });

    it('persists only lightweight UI preferences', () => {
        useEditorStore.getState().setLanguage('en-US');

        const raw = localStorage.getItem(editorUiStorageKey);

        expect(raw).toContain('en-US');
        expect(raw).not.toContain('secret.example.test');
        expect(raw).not.toContain('Authorization');
    });

    it('expands only the first two project file levels by default', () => {
        const tree = folder('GameProject', 0, [
            folder('GameProject/src', 1, [
                folder('GameProject/src/scenes', 2, [
                    folder('GameProject/src/scenes/menu', 3),
                ]),
            ]),
            folder('GameProject/assets', 1),
        ]);

        useEditorStore.getState().setProject(tree);

        expect(useEditorStore.getState().expandedProjectFolders).toEqual([
            'GameProject',
            'GameProject/src',
            'GameProject/assets',
        ]);
    });

    it('restores project-level UI state when setting a project', () => {
        const tree: ProjectFileTreeNode = {
            ...folder('GameProject', 0, [
                folder('GameProject/src', 1, [
                    folder('GameProject/src/scenes', 2, [
                        file('GameProject/src/scenes/Button.scene', 3, 'scene'),
                    ]),
                ]),
                folder('GameProject/assets', 1, [
                    file('GameProject/assets/play.png', 2, 'asset'),
                ]),
            ]),
            projectRootPath: '/repo/GameProject',
            systemPath: '/repo/GameProject',
        };
        localStorage.setItem(editorProjectLayoutStorageKey(tree), JSON.stringify({
            version: 1,
            selectedProjectFilePath: 'GameProject/assets/play.png',
            openedScenePath: 'GameProject/src/scenes/Button.scene',
            expandedProjectFolders: ['GameProject/src', 'GameProject/assets', 'GameProject/missing'],
            expandedHierarchyNodesByScene: {
                'GameProject/src/scenes/Button.scene': ['0:label'],
            },
        }));

        useEditorStore.getState().setProject(tree);

        expect(useEditorStore.getState().selectedProjectFilePath).toBe('GameProject/assets/play.png');
        expect(useEditorStore.getState().openedScenePath).toBe('GameProject/src/scenes/Button.scene');
        expect(useEditorStore.getState().expandedProjectFolders).toEqual([
            'GameProject',
            'GameProject/src',
            'GameProject/assets',
        ]);
        expect(useEditorStore.getState().expandedHierarchyNodesByScene).toEqual({
            'GameProject/src/scenes/Button.scene': ['0:label'],
        });
    });

    it('keeps project layout state isolated by project root path', () => {
        const first = {
            ...folder('GameProject', 0),
            projectRootPath: '/repo/GameProject',
        };
        const second = {
            ...folder('OtherProject', 0),
            projectRootPath: '/repo/OtherProject',
        };

        writeEditorProjectLayoutState(first, {
            selectedProjectFilePath: 'GameProject/src/scenes/Button.scene',
        });
        writeEditorProjectLayoutState(second, {
            selectedProjectFilePath: 'OtherProject/src/scenes/Menu.scene',
        });

        expect(localStorage.getItem(editorProjectLayoutStorageKey(first))).toContain('Button.scene');
        expect(localStorage.getItem(editorProjectLayoutStorageKey(second))).toContain('Menu.scene');
        expect(editorProjectLayoutStorageKey(first)).not.toBe(editorProjectLayoutStorageKey(second));
    });
});
