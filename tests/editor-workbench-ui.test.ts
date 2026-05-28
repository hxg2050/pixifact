import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectFileTreeNode } from '../apps/editor/src/services/projectFileTree';
import { useEditorStore } from '../apps/editor/src/editorStore';
import { EditorApp } from '../apps/editor/src/EditorApp';
import {
    loadCompilerSceneDocument,
    resetCompilerSceneDocument,
} from '../apps/editor/src/document/compilerSceneDocumentController';
import { parseSceneTemplate } from '../packages/pixifact/src/compiler/templateParser';

const host = vi.hoisted(() => ({
    files: new Map<string, string>(),
    fileChangedHandler: undefined as ((event: { projectRootPath: string; path: string; kind: string }) => void) | undefined,
}));

function missingHostCall(name: string) {
    return vi.fn(async () => {
        throw new Error(`Unexpected host call ${name}.`);
    });
}

vi.mock('../apps/editor/src/services/hostBridge', () => ({
    createHostProjectDirectory: missingHostCall('createHostProjectDirectory'),
    createHostProjectFile: missingHostCall('createHostProjectFile'),
    deleteHostProjectEntry: missingHostCall('deleteHostProjectEntry'),
    openHostCodeFile: missingHostCall('openHostCodeFile'),
    openHostDefaultFile: missingHostCall('openHostDefaultFile'),
    pickHostProjectFolder: missingHostCall('pickHostProjectFolder'),
    readHostProjectFileBytes: vi.fn(async () => new Uint8Array()),
    readHostProjectFileText: vi.fn(async (_projectRootPath: string, filePath: string) => {
        const content = host.files.get(filePath);
        if (content === undefined) {
            throw new Error(`Missing test file ${filePath}.`);
        }
        return content;
    }),
    readHostProjectFileTree: vi.fn(async () => projectTree()),
    renameHostProjectEntry: missingHostCall('renameHostProjectEntry'),
    watchHostProjectFiles: vi.fn(async () => {}),
    hostErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
    listenHostProjectFileChanged: vi.fn(async (handler: (event: { projectRootPath: string; path: string; kind: string }) => void) => {
        host.fileChangedHandler = handler;
        return () => {
            host.fileChangedHandler = undefined;
        };
    }),
    writeHostProjectFileText: vi.fn(async () => {}),
}));

function projectTree(): ProjectFileTreeNode {
    return {
        id: 'GameProject',
        name: 'GameProject',
        path: 'GameProject',
        kind: 'folder',
        depth: 0,
        systemPath: '/repo/GameProject',
        projectRootPath: '/repo/GameProject',
        children: [{
            id: 'GameProject/scenes',
            name: 'scenes',
            path: 'GameProject/scenes',
            kind: 'folder',
            depth: 1,
            children: [{
                id: 'GameProject/scenes/Button.scene',
                name: 'Button.scene',
                path: 'GameProject/scenes/Button.scene',
                kind: 'scene',
                depth: 2,
            }, {
                id: 'GameProject/scenes/Child.scene',
                name: 'Child.scene',
                path: 'GameProject/scenes/Child.scene',
                kind: 'scene',
                depth: 2,
            }],
        }, {
            id: 'GameProject/assets',
            name: 'assets',
            path: 'GameProject/assets',
            kind: 'folder',
            depth: 1,
            children: [{
                id: 'GameProject/assets/play.png',
                name: 'play.png',
                path: 'GameProject/assets/play.png',
                kind: 'asset',
                depth: 2,
            }],
        }],
    };
}

function currentScene() {
    return [
        '<Scene name="Button" script="src/scenes/Button.ts">',
        '  <Text id="label" text="Start" />',
        '</Scene>',
        '',
    ].join('\n');
}

function setEditorProject() {
    useEditorStore.setState({
        language: 'zh-CN',
        projectName: 'GameProject',
        projectTree: projectTree(),
        selectedProjectFilePath: 'GameProject/scenes/Button.scene',
        openedScenePath: 'GameProject/scenes/Button.scene',
        expandedProjectFolders: ['GameProject', 'GameProject/scenes'],
        expandedHierarchyNodesByScene: {},
    });
    loadCompilerSceneDocument({
        scenePath: 'GameProject/scenes/Button.scene',
        template: parseSceneTemplate(currentScene()),
        sceneInterfaces: {},
    });
}

async function renderEditorApp() {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
        root.render(createElement(EditorApp));
        await Promise.resolve();
    });
    return {
        container,
        async cleanup() {
            await act(async () => {
                root.unmount();
            });
            container.remove();
        },
    };
}

function textContent(container: HTMLElement) {
    return container.textContent ?? '';
}

beforeEach(() => {
    localStorage.clear();
    host.files = new Map([
        ['GameProject/scenes/Button.scene', currentScene()],
        ['GameProject/scenes/Child.scene', '<Scene name="Child" />\n'],
    ]);
    resetCompilerSceneDocument();
    setEditorProject();
});

afterEach(() => {
    resetCompilerSceneDocument();
    document.body.innerHTML = '';
});

describe('Editor fixed workbench UI', () => {
    it('renders the fixed Scene workbench instead of Dockview panels', async () => {
        const view = await renderEditorApp();
        try {
            expect(view.container.querySelector('[data-testid="editor-workbench"]')).toBeTruthy();
            expect(view.container.querySelector('[data-testid="workbench-hierarchy"]')).toBeTruthy();
            expect(view.container.querySelector('[data-testid="workbench-preview"]')).toBeTruthy();
            expect(view.container.querySelector('[data-testid="workbench-inspector"]')).toBeTruthy();
            expect(view.container.querySelector('[data-testid="project-shelf"]')).toBeTruthy();
            expect(view.container.querySelector('.dockHost')).toBeFalsy();
            expect(view.container.querySelector('.dv-dockview')).toBeFalsy();
            expect(textContent(view.container)).not.toContain('Dockview');
            expect(textContent(view.container)).toContain('Button.scene');
            expect(textContent(view.container)).toContain('Project');
        } finally {
            await view.cleanup();
        }
    });

    it('shows a plain Project Shelf without persistent file management actions', async () => {
        const view = await renderEditorApp();
        try {
            const shelf = view.container.querySelector('[data-testid="project-shelf"]');
            const sceneCards = [...view.container.querySelectorAll('.projectFileCard.scene')];
            const childSceneCard = sceneCards.find((card) => card.textContent?.includes('Child.scene'));
            expect(shelf).toBeTruthy();
            expect(shelf?.querySelector('.projectShelfHeader')).toBeTruthy();
            expect(shelf?.querySelector('.projectShelfBody')).toBeTruthy();
            expect(shelf?.querySelector('[data-testid="project-shelf-tree"]')).toBeTruthy();
            expect(shelf?.querySelector('.systemTree')).toBeTruthy();
            expect(shelf?.querySelector('.projectShelfContents')).toBeTruthy();
            expect(shelf?.querySelector('.projectShelfDetails')).toBeTruthy();
            expect(shelf?.textContent).toContain('Project');
            expect(shelf?.textContent).toContain('GameProject/scenes');
            expect(shelf?.textContent).toContain('Button.scene');
            expect(shelf?.textContent).toContain('Child.scene');
            expect(shelf?.textContent).toContain('play.png');
            expect(childSceneCard?.tagName).toBe('DIV');
            expect(childSceneCard?.getAttribute('role')).toBe('button');
            expect(childSceneCard?.getAttribute('tabindex')).toBe('0');
            expect(shelf?.querySelector('[data-testid="create-scene"]')).toBeFalsy();
            expect(shelf?.querySelector('[data-testid="create-folder"]')).toBeFalsy();
            expect(shelf?.querySelector('[data-testid="rename-entry"]')).toBeFalsy();
            expect(shelf?.textContent).not.toContain('All');
            expect(shelf?.textContent).not.toContain('Images');
            expect(shelf?.textContent).not.toContain('Scripts');
            expect(shelf?.textContent).not.toContain('Docs');
        } finally {
            await view.cleanup();
        }
    });

    it('keeps the top bar focused on the active Scene and core project actions', async () => {
        const view = await renderEditorApp();
        try {
            const topbar = view.container.querySelector('.topbar');
            expect(topbar).toBeTruthy();
            expect(topbar?.textContent).toContain('Pixifact Editor');
            expect(topbar?.textContent).toContain('Button.scene');
            expect(topbar?.textContent).toContain('保存');
            expect(topbar?.textContent).not.toContain('Agent Bridge');
            expect(topbar?.textContent).not.toContain('Sync:');
            expect(topbar?.textContent).not.toContain('重置示例');
            expect(topbar?.querySelector('[aria-label="撤销"]')).toBeFalsy();
            expect(topbar?.querySelector('[aria-label="重做"]')).toBeFalsy();
        } finally {
            await view.cleanup();
        }
    });
});
