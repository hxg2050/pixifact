import { beforeEach, describe, expect, it } from 'vitest';
import {
    editorUiStorageKey,
    useEditorStore,
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
});
