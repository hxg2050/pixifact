import { act, createElement } from 'react';
import { readFileSync } from 'fs';
import { createRoot } from 'react-dom/client';
import type { DockviewApi } from 'dockview-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectFileTreeNode } from '../apps/editor/src/services/projectFileTree';
import { useEditorStore } from '../apps/editor/src/editorStore';
import { EditorApp } from '../apps/editor/src/EditorApp';
import {
    getCompilerSceneDocument,
    loadCompilerSceneDocument,
    resetCompilerSceneDocument,
    selectCompilerSceneNode,
    updateCompilerSceneTemplate,
} from '../apps/editor/src/document/compilerSceneDocumentController';
import {
    actualSizeViewportTransform,
    clampViewportScale,
    compilerSceneSelectionRect,
    fitViewportTransform,
    panViewportTransform,
    resizeManualViewportTransform,
    viewportDeltaToSceneDelta,
    viewportPointToScenePoint,
    zoomViewportTransform,
} from '../apps/editor/src/preview/CompilerSceneViewport';
import { parseSceneTemplate } from '../packages/pixifact/src/compiler/templateParser';

const host = vi.hoisted(() => ({
    files: new Map<string, string>(),
    directories: new Set<string>(),
    fileChangedHandler: undefined as ((event: { projectRootPath: string; path: string; kind: string }) => void) | undefined,
}));

function missingHostCall(name: string) {
    return vi.fn(async () => {
        throw new Error(`Unexpected host call ${name}.`);
    });
}

vi.mock('../apps/editor/src/services/hostBridge', () => ({
    createHostProjectDirectory: vi.fn(async (_projectRootPath: string, directoryPath: string, folderName: string) => {
        host.directories.add(`${directoryPath}/${folderName}`);
    }),
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
    for (const folderPath of [...host.directories].filter((path) => path.startsWith('GameProject/src/scenes/')).sort()) {
        const folderName = folderPath.split('/').pop() ?? folderPath;
        sceneFiles.push({
            id: folderPath,
            name: folderName,
            path: folderPath,
            kind: 'folder',
            depth: 3,
            children: [],
        });
    }

    return withProjectRoot({
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
    });
}

function withProjectRoot(node: ProjectFileTreeNode): ProjectFileTreeNode {
    return {
        ...node,
        projectRootPath: '/repo/GameProject',
        children: node.children?.map(withProjectRoot),
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
        expandedProjectFolders: ['GameProject', 'GameProject/src', 'GameProject/src/scenes', 'GameProject/assets'],
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

function keyDown(target: EventTarget, key: string, options: KeyboardEventInit = {}) {
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...options }));
}

function buttonDisabled(button: Element | null | undefined) {
    return button?.hasAttribute('disabled') || button?.getAttribute('aria-disabled') === 'true';
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
    host.directories = new Set();
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
    it('calculates compiler viewport transforms for fit, actual size, zoom, and resize', () => {
        expect(fitViewportTransform(
            { width: 960, height: 540 },
            { width: 480, height: 270 },
        )).toEqual({
            scale: 0.5,
            offset: { x: 0, y: 0 },
        });
        expect(fitViewportTransform(
            { width: 320, height: 180 },
            { width: 1600, height: 900 },
        )).toEqual({
            scale: 4,
            offset: { x: 160, y: 90 },
        });
        expect(actualSizeViewportTransform(
            { width: 960, height: 540 },
            { width: 1200, height: 800 },
        )).toEqual({
            scale: 1,
            offset: { x: 120, y: 130 },
        });
        expect(clampViewportScale(0.01)).toBe(0.1);
        expect(clampViewportScale(20)).toBe(8);
        expect(zoomViewportTransform(
            { scale: 1, offset: { x: 100, y: 50 } },
            { x: 300, y: 250 },
            2,
        )).toEqual({
            scale: 2,
            offset: { x: -100, y: -150 },
        });
        expect(viewportPointToScenePoint(
            { scale: 2, offset: { x: -100, y: -150 } },
            { x: 300, y: 250 },
        )).toEqual({ x: 200, y: 200 });
        expect(viewportDeltaToSceneDelta(
            { scale: 2, offset: { x: -100, y: -150 } },
            { x: 20, y: 10 },
        )).toEqual({ x: 10, y: 5 });
        expect(panViewportTransform(
            { scale: 1.5, offset: { x: 40, y: 60 } },
            { x: 20, y: -10 },
        )).toEqual({
            scale: 1.5,
            offset: { x: 60, y: 50 },
        });
        expect(resizeManualViewportTransform(
            { scale: 1.5, offset: { x: 40, y: 60 } },
            { width: 800, height: 600 },
            { width: 1000, height: 900 },
        )).toEqual({
            scale: 1.5,
            offset: { x: 140, y: 210 },
        });
    });

    it('uses transformed Pixi bounds directly for compiler viewport selection overlays', () => {
        expect(compilerSceneSelectionRect({
            getBounds: () => ({
                x: 24,
                y: 36,
                width: 120,
                height: 48,
            }),
        })).toEqual({
            x: 24,
            y: 36,
            width: 120,
            height: 48,
        });
        expect(compilerSceneSelectionRect({
            getBounds: () => ({
                x: 24,
                y: 36,
                width: 0,
                height: 48,
            }),
        })).toBeUndefined();
    });

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
            expect(view.container.querySelector('[data-testid="workbench-project-preview"]')).toBeTruthy();
            expect(view.container.querySelector('[data-testid="project-shelf"]')).toBeTruthy();
            const hierarchy = view.container.querySelector('[data-testid="compiler-scene-hierarchy"]');
            const rootDropZone = hierarchy?.querySelector('.rootDropZone');
            expect(hierarchy).toBeTruthy();
            expect(rootDropZone).toBeFalsy();
            expect(hierarchy?.textContent).not.toContain('放到根层级');
            expect(hierarchy?.textContent).not.toContain('拖动调整层级');
            expect(hierarchy?.querySelector('button[title="Add Container"]')).toBeFalsy();
            expect(hierarchy?.querySelector('button[title="Add Text"]')).toBeFalsy();
            expect(hierarchy?.querySelector('button[title="Add Graphics"]')).toBeFalsy();
            expect(view.container.querySelector('.dockHost')).toBeTruthy();
            expect(view.container.querySelector('.dv-dockview')).toBeTruthy();
            expect(textContent(view.container)).not.toContain('Dockview');
            expect(textContent(view.container)).toContain('Button.scene');
            expect(textContent(view.container)).toContain('Project');
            const root = dockviewApi?.toJSON().grid.root;
            const rootData = root?.type === 'branch' && Array.isArray(root.data) ? root.data : [];
            const leftColumn = rootData[0];
            const centerColumn = rootData[1];
            const rightColumn = rootData[2];
            const leftColumnData = leftColumn?.type === 'branch' && Array.isArray(leftColumn.data) ? leftColumn.data : [];
            const centerPanel = centerColumn?.type === 'leaf' ? centerColumn : undefined;
            const rightColumnData = rightColumn?.type === 'branch' && Array.isArray(rightColumn.data) ? rightColumn.data : [];
            expect(dockviewApi).toBeTruthy();
            expect(dockviewApi?.toJSON().grid.orientation).toBe('HORIZONTAL');
            expect(rootData).toHaveLength(3);
            expect(leftColumnData).toHaveLength(2);
            expect(rightColumnData).toHaveLength(2);
            expect(leftColumnData.map((node) => panelIdFromGroup(node.data))).toEqual(['hierarchy', 'project']);
            expect(panelIdFromGroup(centerPanel?.data)).toBe('preview');
            expect(rightColumnData.map((node) => panelIdFromGroup(node.data))).toEqual(['inspector', 'projectPreview']);
        } finally {
            await view.cleanup();
        }
    });

    it('wires compiler viewport toolbar controls to visible state', async () => {
        const view = await renderEditorApp();
        try {
            const viewport = view.container.querySelector('[data-testid="viewport-stage"]');
            const actions = view.container.querySelector('.viewportActions');
            const fitButton = [...(actions?.querySelectorAll('button') ?? [])]
                .find((button) => button.textContent === '适配');
            const gridButton = [...(actions?.querySelectorAll('button') ?? [])]
                .find((button) => button.textContent === '网格');
            const actualSizeButton = [...(actions?.querySelectorAll('button') ?? [])]
                .find((button) => button.textContent === '100%');

            expect(viewport).toBeTruthy();
            expect(actualSizeButton).toBeTruthy();
            expect(fitButton).toBeTruthy();
            expect(gridButton).toBeTruthy();
            expect(fitButton?.getAttribute('aria-pressed')).toBe('true');
            expect(gridButton?.getAttribute('aria-pressed')).toBe('true');
            expect(view.container.querySelector('.compilerSceneGrid')).toBeTruthy();
            expect(view.container.querySelector('.compilerSceneBounds')).toBeTruthy();

            await act(async () => {
                click(gridButton!);
            });

            expect(gridButton?.getAttribute('aria-pressed')).toBe('false');
            expect(view.container.querySelector('.compilerSceneGrid')).toBeFalsy();

            await act(async () => {
                click(actualSizeButton!);
            });

            expect(fitButton?.getAttribute('aria-pressed')).toBe('false');

            await act(async () => {
                click(fitButton!);
            });

            expect(fitButton?.getAttribute('aria-pressed')).toBe('true');
        } finally {
            await view.cleanup();
        }
    });

    it('shows a plain Project Shelf as a single tree with selected item details in a separate panel', async () => {
        const view = await renderEditorApp();
        try {
            const shelf = view.container.querySelector('[data-testid="project-shelf"]');
            const projectPreview = view.container.querySelector('[data-testid="project-preview-panel"]');
            const projectTree = shelf?.querySelector('[data-testid="project-shelf-tree"]');
            const projectPath = shelf?.querySelector('.projectShelfPath');
            const nestedFolderRow = projectTree?.querySelector('[title="GameProject/src/scenes"]');
            const sceneFileTreeRow = projectTree?.querySelector('[title="GameProject/src/scenes/Button.scene"]');
            const tsFileTreeRow = projectTree?.querySelector('[title="GameProject/src/scenes/Button.ts"]');
            const assetFileTreeRow = projectTree?.querySelector('[title="GameProject/assets/play.png"]');
            const nestedFolderGridRow = nestedFolderRow?.closest('[role="row"]') as HTMLElement | null;
            const nestedFolderChevron = nestedFolderGridRow?.querySelector('.treeChevron') as HTMLElement | null;
            expect(shelf).toBeTruthy();
            expect(shelf?.querySelector('.projectShelfHeader')).toBeTruthy();
            expect(shelf?.querySelector('.projectShelfBody')).toBeTruthy();
            expect(shelf?.querySelector('[data-testid="project-shelf-tree"]')).toBeTruthy();
            expect(shelf?.querySelector('.systemTree')).toBeTruthy();
            expect(shelf?.querySelector('.projectShelfContents')).toBeFalsy();
            expect(shelf?.querySelector('.projectShelfDetails')).toBeFalsy();
            expect(projectPreview).toBeTruthy();
            expect(projectPreview?.textContent).toContain('Button.scene');
            expect(projectPreview?.textContent).toContain('双击进入 Scene 编辑');
            expect(shelf?.textContent).toContain('Project');
            expect(projectPath?.textContent).toBe('scenes');
            expect(projectPath?.getAttribute('title')).toBe('GameProject/src/scenes');
            expect(projectTree?.textContent).toContain('Button.scene');
            expect(projectTree?.textContent).toContain('Child.scene');
            expect(projectTree?.textContent).toContain('play.png');
            expect(sceneFileTreeRow).toBeTruthy();
            expect(assetFileTreeRow).toBeTruthy();
            expect(sceneFileTreeRow?.tagName).toBe('BUTTON');
            expect(nestedFolderRow?.querySelector('.projectFileIcon--folder-open')).toBeTruthy();
            expect(sceneFileTreeRow?.querySelector('.projectFileIcon--file-box')).toBeTruthy();
            expect(tsFileTreeRow?.querySelector('.projectFileIcon--file-code')).toBeTruthy();
            expect(assetFileTreeRow?.querySelector('.projectFileIcon--file')).toBeTruthy();
            expect(nestedFolderGridRow?.style.getPropertyValue('--tree-indent')).toBe('28px');
            expect(nestedFolderGridRow?.getAttribute('role')).toBe('row');
            expect(nestedFolderChevron).toBeTruthy();
            expect(shelf?.querySelector('[data-testid="create-scene"]')).toBeTruthy();
            expect(shelf?.querySelector('[data-testid="create-folder"]')).toBeTruthy();
            expect(shelf?.querySelector('input[aria-label="文件夹名称"]')).toBeFalsy();
            expect(shelf?.querySelector('[data-testid="rename-entry"]')).toBeFalsy();
            expect(shelf?.textContent).not.toContain('All');
            expect(shelf?.textContent).not.toContain('Images');
            expect(shelf?.textContent).not.toContain('Scripts');
            expect(shelf?.textContent).not.toContain('Docs');
        } finally {
            await view.cleanup();
        }
    });

    it('shows only the selected compiler node details in Inspector', async () => {
        selectCompilerSceneNode('0:label');
        const view = await renderEditorApp();
        try {
            const inspector = view.container.querySelector('[data-testid="compiler-scene-inspector"]');
            const sectionTitles = [...inspector?.querySelectorAll('.inspectorSection h3') ?? []].map((title) => title.textContent);
            const xInput = inspector?.querySelector('input[aria-label="x"]') as HTMLInputElement | null;
            const yInput = inspector?.querySelector('input[aria-label="y"]') as HTMLInputElement | null;
            const widthInput = inspector?.querySelector('input[aria-label="width"]') as HTMLInputElement | null;
            const heightInput = inspector?.querySelector('input[aria-label="height"]') as HTMLInputElement | null;
            const scaleXInput = inspector?.querySelector('input[aria-label="scaleX"]') as HTMLInputElement | null;
            const scaleYInput = inspector?.querySelector('input[aria-label="scaleY"]') as HTMLInputElement | null;
            const alphaInput = inspector?.querySelector('input[aria-label="alpha"]') as HTMLInputElement | null;
            const visibleCheckbox = inspector?.querySelector('[aria-label="visible"]') as HTMLInputElement | null;
            const zIndexInput = inspector?.querySelector('input[aria-label="zIndex"]') as HTMLInputElement | null;

            expect(inspector).toBeTruthy();
            expect(sectionTitles).toEqual(['标识', 'Transform', 'Display', 'Text']);
            expect(sectionTitles).not.toContain('Scene');
            expect(sectionTitles).not.toContain('脚本绑定');
            expect(sectionTitles).not.toContain('公开契约');
            expect(xInput?.value).toBe('0');
            expect(yInput?.value).toBe('0');
            expect(widthInput?.value).toBe('120');
            expect(heightInput?.value).toBe('28');
            expect(scaleXInput?.value).toBe('1');
            expect(scaleYInput?.value).toBe('1');
            expect(alphaInput?.value).toBe('1');
            expect(visibleCheckbox?.checked).toBe(true);
            expect(zIndexInput?.value).toBe('0');
        } finally {
            await view.cleanup();
        }
    });

    it('auto commits Inspector text edits without pressing Enter', async () => {
        selectCompilerSceneNode('0:label');
        const view = await renderEditorApp();
        vi.useFakeTimers();
        try {
            const textInput = view.container.querySelector('input[aria-label="text"]') as HTMLInputElement | null;
            expect(textInput).toBeTruthy();

            await act(async () => {
                textInput!.focus();
                fillInput(textInput!, 'Continue');
                await Promise.resolve();
            });
            expect(getCompilerSceneDocument()?.template.children[0].props.text).toBe('Start');

            await act(async () => {
                vi.advanceTimersByTime(300);
                await Promise.resolve();
            });
            expect(getCompilerSceneDocument()?.template.children[0].props.text).toBe('Continue');
        } finally {
            vi.useRealTimers();
            await view.cleanup();
        }
    });

    it('auto commits Inspector number edits without pressing Enter', async () => {
        selectCompilerSceneNode('0:label');
        const view = await renderEditorApp();
        vi.useFakeTimers();
        try {
            const xInput = view.container.querySelector('input[aria-label="x"]') as HTMLInputElement | null;
            expect(xInput).toBeTruthy();

            await act(async () => {
                xInput!.focus();
                fillInput(xInput!, '42');
                await Promise.resolve();
            });
            expect(getCompilerSceneDocument()?.template.children[0].props.x).toBeUndefined();

            await act(async () => {
                vi.advanceTimersByTime(300);
                await Promise.resolve();
            });
            expect(getCompilerSceneDocument()?.template.children[0].props.x).toBe(42);
        } finally {
            vi.useRealTimers();
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

    it('creates a folder from the compact Project Shelf dialog', async () => {
        const view = await renderEditorApp();
        try {
            const createButton = view.container.querySelector('[data-testid="create-folder"]');
            expect(createButton).toBeTruthy();

            await act(async () => {
                click(createButton!);
                await Promise.resolve();
            });

            const nameInput = document.body.querySelector('[data-testid="create-folder-name"]') as HTMLInputElement | null;
            const submitButton = document.body.querySelector('[data-testid="confirm-create-folder"]');
            expect(nameInput).toBeTruthy();
            expect(submitButton).toBeTruthy();

            await act(async () => {
                fillInput(nameInput!, 'menus');
                await Promise.resolve();
            });
            await act(async () => {
                click(submitButton!);
                await Promise.resolve();
                await Promise.resolve();
            });

            expect(host.directories.has('GameProject/src/scenes/menus')).toBe(true);
            expect(useEditorStore.getState().selectedProjectFilePath).toBe('GameProject/src/scenes/menus');
            expect(view.container.querySelector('[title="GameProject/src/scenes/menus"]')).toBeTruthy();
            expect(textContent(view.container)).toContain('已创建文件夹 menus。');
            expect(document.body.querySelector('[data-testid="create-folder-name"]')).toBeFalsy();
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
            expect(topbar?.querySelector('[aria-label="撤销"]')).toBeTruthy();
            expect(topbar?.querySelector('[aria-label="重做"]')).toBeTruthy();
            expect(buttonDisabled(topbar?.querySelector('[aria-label="撤销"]'))).toBe(true);
            expect(buttonDisabled(topbar?.querySelector('[aria-label="重做"]'))).toBe(true);

            await act(async () => {
                updateCompilerSceneTemplate({ props: { width: 961 } });
                await Promise.resolve();
            });
            expect(getCompilerSceneDocument()?.template.props.width).toBe(961);
            expect(buttonDisabled(topbar?.querySelector('[aria-label="撤销"]'))).toBe(false);
            expect(buttonDisabled(topbar?.querySelector('[aria-label="重做"]'))).toBe(true);

            await act(async () => {
                click(topbar!.querySelector('[aria-label="撤销"]')!);
                await Promise.resolve();
            });
            expect(getCompilerSceneDocument()?.template.props.width).toBeUndefined();
            expect(buttonDisabled(topbar?.querySelector('[aria-label="撤销"]'))).toBe(true);
            expect(buttonDisabled(topbar?.querySelector('[aria-label="重做"]'))).toBe(false);

            await act(async () => {
                keyDown(window, 'z', { metaKey: true, shiftKey: true });
                await Promise.resolve();
            });
            expect(getCompilerSceneDocument()?.template.props.width).toBe(961);

            const input = document.createElement('input');
            document.body.append(input);
            input.focus();
            await act(async () => {
                keyDown(input, 'z', { metaKey: true });
                await Promise.resolve();
            });
            expect(getCompilerSceneDocument()?.template.props.width).toBe(961);
            input.remove();
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
            expect(sashes).toHaveLength(4);
            expect(sashes.filter((sash) => sash.classList.contains('dv-enabled'))).toHaveLength(3);
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
