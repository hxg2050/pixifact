import { act, createElement } from 'react';
import { readFileSync } from 'fs';
import { createRoot } from 'react-dom/client';
import type { DockviewApi } from 'dockview-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectFileTreeNode } from '../apps/editor/src/services/projectFileTree';
import { useEditorStore } from '../apps/editor/src/editorStore';
import { EditorApp } from '../apps/editor/src/EditorApp';
import {
    loadCompilerSceneDocument,
    resetCompilerSceneDocument,
    updateCompilerSceneTemplate,
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
    createHostProjectFile: vi.fn(async (_projectRootPath: string, directoryPath: string, fileName: string, content: string) => {
        host.files.set(`${directoryPath}/${fileName}`, content);
    }),
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

const originalHTMLElementClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
const originalHTMLElementClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

function projectTree(): ProjectFileTreeNode {
    const sceneFiles: ProjectFileTreeNode[] = [{
        id: 'GameProject/src/scenes/Button.scene',
        name: 'Button.scene',
        path: 'GameProject/src/scenes/Button.scene',
        kind: 'scene',
        depth: 3,
    }, {
        id: 'GameProject/src/scenes/Child.scene',
        name: 'Child.scene',
        path: 'GameProject/src/scenes/Child.scene',
        kind: 'scene',
        depth: 3,
    }, {
        id: 'GameProject/src/scenes/Button.ts',
        name: 'Button.ts',
        path: 'GameProject/src/scenes/Button.ts',
        kind: 'script',
        depth: 3,
    }, {
        id: 'GameProject/src/scenes/Child.ts',
        name: 'Child.ts',
        path: 'GameProject/src/scenes/Child.ts',
        kind: 'script',
        depth: 3,
    }];
    if (host.files.has('GameProject/src/scenes/StatusPanel.scene')) {
        sceneFiles.push({
            id: 'GameProject/src/scenes/StatusPanel.scene',
            name: 'StatusPanel.scene',
            path: 'GameProject/src/scenes/StatusPanel.scene',
            kind: 'scene',
            depth: 3,
        });
    }
    if (host.files.has('GameProject/src/scenes/StatusPanel.ts')) {
        sceneFiles.push({
            id: 'GameProject/src/scenes/StatusPanel.ts',
            name: 'StatusPanel.ts',
            path: 'GameProject/src/scenes/StatusPanel.ts',
            kind: 'script',
            depth: 3,
        });
    }

    return {
        id: 'GameProject',
        name: 'GameProject',
        path: 'GameProject',
        kind: 'folder',
        depth: 0,
        systemPath: '/repo/GameProject',
        projectRootPath: '/repo/GameProject',
        children: [{
            id: 'GameProject/src',
            name: 'src',
            path: 'GameProject/src',
            kind: 'folder',
            depth: 1,
            children: [{
                id: 'GameProject/src/scenes',
                name: 'scenes',
                path: 'GameProject/src/scenes',
                kind: 'folder',
                depth: 2,
                children: sceneFiles,
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
        '<Scene name="Button">',
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
        selectedProjectFilePath: 'GameProject/src/scenes/Button.scene',
        openedScenePath: 'GameProject/src/scenes/Button.scene',
        expandedProjectFolders: ['GameProject', 'GameProject/src', 'GameProject/src/scenes'],
        expandedHierarchyNodesByScene: {},
    });
    loadCompilerSceneDocument({
        scenePath: 'GameProject/src/scenes/Button.scene',
        template: parseSceneTemplate(currentScene()),
        sceneInterfaces: {},
    });
}

async function renderEditorApp(options?: { onDockviewReady?: (api: DockviewApi) => void }) {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
        root.render(createElement(EditorApp, options));
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

function panelIdFromGroup(group: unknown) {
    if (!group || typeof group !== 'object' || !('views' in group)) {
        return undefined;
    }
    const views = (group as { views?: unknown }).views;
    return Array.isArray(views) && typeof views[0] === 'string' ? views[0] : undefined;
}

function dockviewSashes(container: HTMLElement) {
    return [...container.getElementsByClassName('dv-sash')] as HTMLElement[];
}

function click(element: Element) {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

function fillInput(input: HTMLInputElement, value: string) {
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

function keyDown(element: Element, key: string) {
    element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key }));
}

beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
        configurable: true,
        get() {
            return 1400;
        },
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
        configurable: true,
        get() {
            return 800;
        },
    });
    localStorage.clear();
    host.files = new Map([
        ['GameProject/src/scenes/Button.scene', currentScene()],
        ['GameProject/src/scenes/Child.scene', '<Scene name="Child" />\n'],
        ['GameProject/src/scenes/Button.ts', '@scene()\nexport class Button {}\n'],
        ['GameProject/src/scenes/Child.ts', '@scene()\nexport class Child {}\n'],
    ]);
    resetCompilerSceneDocument();
    setEditorProject();
});

afterEach(() => {
    if (originalHTMLElementClientWidth) {
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalHTMLElementClientWidth);
    } else {
        Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
    }
    if (originalHTMLElementClientHeight) {
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalHTMLElementClientHeight);
    } else {
        Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
    }
    resetCompilerSceneDocument();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
});

describe('Editor workbench UI', () => {
    it('renders the Dockview Scene workbench with Project Shelf as a dock panel', async () => {
        let dockviewApi: DockviewApi | undefined;
        const view = await renderEditorApp({ onDockviewReady: (api) => {
            dockviewApi = api;
        } });
        try {
            expect(view.container.querySelector('[data-testid="editor-workbench"]')).toBeTruthy();
            expect(view.container.querySelector('[data-testid="workbench-hierarchy"]')).toBeTruthy();
            expect(view.container.querySelector('[data-testid="workbench-preview"]')).toBeTruthy();
            expect(view.container.querySelector('[data-testid="workbench-inspector"]')).toBeTruthy();
            expect(view.container.querySelector('[data-testid="project-shelf"]')).toBeTruthy();
            expect(view.container.querySelector('.dockHost')).toBeTruthy();
            expect(view.container.querySelector('.dv-dockview')).toBeTruthy();
            expect(textContent(view.container)).not.toContain('Dockview');
            expect(textContent(view.container)).toContain('Button.scene');
            expect(textContent(view.container)).toContain('Project');
            const root = dockviewApi?.toJSON().grid.root;
            const rootData = root?.type === 'branch' && Array.isArray(root.data) ? root.data : [];
            const workspaceRoot = rootData[0];
            const inspector = rootData[1];
            const workspaceData = workspaceRoot?.type === 'branch' && Array.isArray(workspaceRoot.data) ? workspaceRoot.data : [];
            const upperWorkspace = workspaceData[0];
            const project = workspaceData[1];
            const upperWorkspaceData = upperWorkspace?.type === 'branch' && Array.isArray(upperWorkspace.data) ? upperWorkspace.data : [];
            expect(dockviewApi).toBeTruthy();
            expect(dockviewApi?.toJSON().grid.orientation).toBe('HORIZONTAL');
            expect(rootData).toHaveLength(2);
            expect(workspaceData).toHaveLength(2);
            expect(upperWorkspaceData.map((node) => panelIdFromGroup(node.data))).toEqual(['hierarchy', 'preview']);
            expect(panelIdFromGroup(project?.data)).toBe('project');
            expect(panelIdFromGroup(inspector?.data)).toBe('inspector');
        } finally {
            await view.cleanup();
        }
    });

    it('shows a plain Project Shelf with folders on the left and current folder files on the right', async () => {
        const view = await renderEditorApp();
        try {
            const shelf = view.container.querySelector('[data-testid="project-shelf"]');
            const sceneCards = [...view.container.querySelectorAll('.projectFileCard.scene')];
            const childSceneCard = sceneCards.find((card) => card.textContent?.includes('Child.scene'));
            const projectTree = shelf?.querySelector('[data-testid="project-shelf-tree"]');
            const nestedFolderRow = projectTree?.querySelector('[title="GameProject/src/scenes"]');
            const sceneFileTreeRow = projectTree?.querySelector('[title="GameProject/src/scenes/Button.scene"]');
            const assetFileTreeRow = projectTree?.querySelector('[title="GameProject/assets/play.png"]');
            const projectContents = shelf?.querySelector('[data-testid="project-shelf-contents"]');
            const nestedFolderGridRow = nestedFolderRow?.closest('[role="row"]') as HTMLElement | null;
            const nestedFolderChevron = nestedFolderGridRow?.querySelector('.treeChevron') as HTMLElement | null;
            expect(shelf).toBeTruthy();
            expect(shelf?.querySelector('.projectShelfHeader')).toBeTruthy();
            expect(shelf?.querySelector('.projectShelfBody')).toBeTruthy();
            expect(shelf?.querySelector('[data-testid="project-shelf-tree"]')).toBeTruthy();
            expect(shelf?.querySelector('.systemTree')).toBeTruthy();
            expect(shelf?.querySelector('.projectShelfContents')).toBeTruthy();
            expect(shelf?.querySelector('.projectShelfDetails')).toBeTruthy();
            expect(shelf?.textContent).toContain('Project');
            expect(shelf?.textContent).toContain('GameProject/src/scenes');
            expect(projectTree?.textContent).not.toContain('Button.scene');
            expect(projectTree?.textContent).not.toContain('play.png');
            expect(sceneFileTreeRow).toBeFalsy();
            expect(assetFileTreeRow).toBeFalsy();
            expect(projectContents?.textContent).toContain('Button.scene');
            expect(projectContents?.textContent).toContain('Child.scene');
            expect(projectContents?.textContent).not.toContain('play.png');
            expect(childSceneCard?.tagName).toBe('DIV');
            expect(childSceneCard?.getAttribute('role')).toBe('button');
            expect(childSceneCard?.getAttribute('tabindex')).toBe('0');
            expect(nestedFolderGridRow?.style.getPropertyValue('--tree-indent')).toBe('28px');
            expect(nestedFolderGridRow?.getAttribute('role')).toBe('row');
            expect(nestedFolderChevron).toBeTruthy();
            expect(shelf?.querySelector('[data-testid="create-scene"]')).toBeTruthy();
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

    it('creates a Scene from Project Shelf without opening it', async () => {
        const confirm = vi.fn(() => true);
        vi.stubGlobal('confirm', confirm);
        updateCompilerSceneTemplate({ props: { width: 961 } });
        const view = await renderEditorApp();
        try {
            const createButton = view.container.querySelector('[data-testid="create-scene"]');
            expect(createButton).toBeTruthy();

            await act(async () => {
                click(createButton!);
                await Promise.resolve();
            });

            const nameInput = document.body.querySelector('[data-testid="create-scene-name"]') as HTMLInputElement | null;
            const submitButton = document.body.querySelector('[data-testid="confirm-create-scene"]');
            expect(nameInput).toBeTruthy();
            expect(submitButton).toBeTruthy();

            await act(async () => {
                fillInput(nameInput!, 'status panel');
                await Promise.resolve();
            });
            await act(async () => {
                click(submitButton!);
                await Promise.resolve();
                await Promise.resolve();
            });

            const state = useEditorStore.getState();
            expect(confirm).not.toHaveBeenCalled();
            expect(state.openedScenePath).toBe('GameProject/src/scenes/Button.scene');
            expect(state.selectedProjectFilePath).toBe('GameProject/src/scenes/StatusPanel.scene');
            expect(host.files.get('GameProject/src/scenes/StatusPanel.scene')).toBe('<Scene name="StatusPanel" width="960" height="540">\n</Scene>\n');
            expect(host.files.get('GameProject/src/scenes/StatusPanel.ts')).toContain('export class StatusPanel');
            expect(view.container.querySelector('[title="GameProject/src/scenes/StatusPanel.scene"]')).toBeTruthy();
            expect(textContent(view.container)).toContain('已创建 StatusPanel.scene。');
        } finally {
            await view.cleanup();
        }
    });

    it('keeps duplicate Scene creation errors inside the dialog', async () => {
        const view = await renderEditorApp();
        try {
            const createButton = view.container.querySelector('[data-testid="create-scene"]');
            await act(async () => {
                click(createButton!);
                await Promise.resolve();
            });

            const nameInput = document.body.querySelector('[data-testid="create-scene-name"]') as HTMLInputElement | null;
            const submitButton = document.body.querySelector('[data-testid="confirm-create-scene"]');
            expect(nameInput).toBeTruthy();
            expect(submitButton).toBeTruthy();

            await act(async () => {
                fillInput(nameInput!, 'button');
                await Promise.resolve();
            });
            await act(async () => {
                click(submitButton!);
                await Promise.resolve();
            });

            const error = document.body.querySelector('[data-testid="create-scene-error"]');
            expect(error?.textContent).toContain('已存在 Button.scene');
            expect(document.body.querySelector('[data-testid="create-scene-name"]')).toBeTruthy();
            expect((document.body.querySelector('[data-testid="create-scene-name"]') as HTMLInputElement | null)?.value).toBe('button');
            expect(useEditorStore.getState().openedScenePath).toBe('GameProject/src/scenes/Button.scene');
            expect(useEditorStore.getState().selectedProjectFilePath).toBe('GameProject/src/scenes/Button.scene');
        } finally {
            await view.cleanup();
        }
    });

    it('closes the create Scene dialog with Escape and clears the draft', async () => {
        const view = await renderEditorApp();
        try {
            const createButton = view.container.querySelector('[data-testid="create-scene"]');
            await act(async () => {
                click(createButton!);
                await Promise.resolve();
            });

            const nameInput = document.body.querySelector('[data-testid="create-scene-name"]') as HTMLInputElement | null;
            expect(nameInput).toBeTruthy();
            await act(async () => {
                fillInput(nameInput!, 'draft scene');
                await Promise.resolve();
            });
            await act(async () => {
                keyDown(document.body.querySelector('[role="dialog"]')!, 'Escape');
                await Promise.resolve();
            });

            expect(document.body.querySelector('[data-testid="create-scene-name"]')).toBeFalsy();

            await act(async () => {
                click(createButton!);
                await Promise.resolve();
            });

            const reopenedInput = document.body.querySelector('[data-testid="create-scene-name"]') as HTMLInputElement | null;
            expect(reopenedInput).toBeTruthy();
            expect(reopenedInput?.value).toBe('');
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

    it('keeps Dockview resize edges active in the default workbench layout', async () => {
        let dockviewApi: DockviewApi | undefined;
        const view = await renderEditorApp({ onDockviewReady: (api) => {
            dockviewApi = api;
        } });
        try {
            dockviewApi?.layout(1400, 800);
            const sashes = dockviewSashes(view.container);
            expect(sashes).toHaveLength(3);
            expect(sashes.every((sash) => sash.classList.contains('dv-enabled'))).toBe(true);
            expect(sashes.some((sash) => sash.classList.contains('dv-disabled'))).toBe(false);
        } finally {
            await view.cleanup();
        }
    });

    it('uses real Dockview sash boxes for resize cursor hit areas', () => {
        const styles = readFileSync('apps/editor/src/styles.css', 'utf8');
        expect(styles).toContain('--dv-active-sash-color');
        expect(styles).toContain('.dv-split-view-container.dv-horizontal > .dv-sash-container > .dv-sash:not(.dv-disabled)');
        expect(styles).toContain('.dv-split-view-container.dv-vertical > .dv-sash-container > .dv-sash:not(.dv-disabled)');
        expect(styles).toContain('width: 8px');
        expect(styles).toContain('height: 8px');
        expect(styles).toContain('margin-left: -2px');
        expect(styles).toContain('margin-top: -2px');
        expect(styles).toContain('cursor: col-resize');
        expect(styles).toContain('cursor: row-resize');
        expect(styles).not.toContain('cursor: ew-resize');
        expect(styles).not.toContain('cursor: ns-resize');
        expect(styles).not.toContain('cursor: inherit');
        expect(styles).not.toContain('.dv-sash:not(.dv-disabled)::before');
        expect(styles).not.toContain('.dv-resize-container');
    });
});
