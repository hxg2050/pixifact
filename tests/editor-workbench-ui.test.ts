import { StrictMode, act, createElement } from 'react';
import { readFileSync } from 'fs';
import { createRoot } from 'react-dom/client';
import type { DockviewApi } from 'dockview-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectFileTreeNode } from '../apps/editor/src/services/projectFileTree';
import {
    readEditorProjectLayoutState,
    useEditorStore,
    writeEditorProjectLayoutState,
} from '../apps/editor/src/editorStore';
import { EditorApp } from '../apps/editor/src/EditorApp';
import {
    getCompilerSceneDocument,
    loadCompilerSceneDocument,
    resetCompilerSceneDocument,
    selectCompilerSceneNode,
    updateCompilerSceneNodePropsInPlace,
    updateCompilerSceneTemplate,
} from '../apps/editor/src/document/compilerSceneDocumentController';
import { InspectorPanel } from '../apps/editor/src/panels/InspectorPanel';
import {
    actualSizeViewportTransform,
    canBeginCompilerSceneMove,
    clampViewportScale,
    compilerScenePreviewEventFeatures,
    compilerScenePointInRect,
    compilerSceneSelectionRect,
    fitViewportTransform,
    gridTransformStyle,
    isEditableCompilerSceneHitTarget,
    moveCompilerSceneNodeProps,
    panViewportTransform,
    pickTopCompilerSceneHit,
    pickCompilerSceneResizeHandle,
    resizeManualViewportTransform,
    resizeCompilerSceneNodeProps,
    selectCompilerSceneViewportHit,
    viewportDeltaToSceneDelta,
    viewportPointToScenePoint,
    viewportTransformStyle,
    zoomViewportTransform,
} from '../apps/editor/src/preview/CompilerSceneViewport';
import { parseSceneTemplate } from '../packages/pixifact/src/compiler/templateParser';
import {
    beginSceneViewProfile,
    disableSceneViewProfiler,
    enableSceneViewProfiler,
    getSceneViewProfilerSnapshot,
    measureSceneViewProfile,
    noteSceneViewProfile,
    sceneViewProfilerEnabled,
} from '../apps/editor/src/services/sceneViewProfiler';

const host = vi.hoisted(() => ({
    files: new Map<string, string>(),
    directories: new Set<string>(),
    fileChangedHandler: undefined as ((event: { projectRootPath: string; path: string; kind: string }) => void) | undefined,
    pickedProject: undefined as ProjectFileTreeNode | undefined,
    readFileCalls: [] as string[],
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
    pickHostProjectFolder: vi.fn(async () => {
        if (!host.pickedProject) {
            throw new Error('Unexpected host call pickHostProjectFolder.');
        }
        return host.pickedProject;
    }),
    readHostProjectFileBytes: vi.fn(async () => new Uint8Array()),
    readHostProjectFileText: vi.fn(async (_projectRootPath: string, filePath: string) => {
        host.readFileCalls.push(filePath);
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
            id: 'GameProject/pixifact.project.json',
            name: 'pixifact.project.json',
            path: 'GameProject/pixifact.project.json',
            kind: 'unknown',
            depth: 1,
        }, {
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

function currentScript() {
    return '@scene()\nexport class Button {}\n';
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

async function renderEditorApp(options?: { onDockviewReady?: (api: DockviewApi) => void; strict?: boolean }) {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
        const app = createElement(EditorApp, {
            onDockviewReady: options?.onDockviewReady,
        });
        root.render(options?.strict ? createElement(StrictMode, null, app) : app);
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

function defaultDockviewPanelIds(api?: DockviewApi) {
    const root = api?.toJSON().grid.root;
    const rootData = root?.type === 'branch' && Array.isArray(root.data) ? root.data : [];
    const leftColumn = rootData[0];
    const centerColumn = rootData[1];
    const rightColumn = rootData[2];
    const leftColumnData = leftColumn?.type === 'branch' && Array.isArray(leftColumn.data) ? leftColumn.data : [];
    const centerPanel = centerColumn?.type === 'leaf' ? centerColumn : undefined;
    const rightColumnData = rightColumn?.type === 'branch' && Array.isArray(rightColumn.data) ? rightColumn.data : [];
    return {
        center: panelIdFromGroup(centerPanel?.data),
        left: leftColumnData.map((node) => panelIdFromGroup(node.data)),
        right: rightColumnData.map((node) => panelIdFromGroup(node.data)),
        rootCount: rootData.length,
    };
}

function expectDefaultDockviewLayout(api?: DockviewApi) {
    expect(api).toBeTruthy();
    expect(api?.toJSON().grid.orientation).toBe('HORIZONTAL');
    expect(defaultDockviewPanelIds(api)).toEqual({
        rootCount: 3,
        left: ['hierarchy', 'project'],
        center: 'preview',
        right: ['inspector', 'projectPreview'],
    });
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
        ['GameProject/pixifact.project.json', JSON.stringify({
            version: 1,
            name: 'Game Project',
            resolution: {
                width: 640,
                height: 1136,
            },
            scenes: {
                button: 'src/scenes/Button.scene',
            },
        })],
        ['GameProject/src/scenes/Button.scene', currentScene()],
        ['GameProject/src/scenes/Child.scene', '<Scene name="Child" />\n'],
        ['GameProject/src/scenes/Button.ts', currentScript()],
        ['GameProject/src/scenes/Child.ts', '@scene()\nexport class Child {}\n'],
    ]);
    host.directories = new Set();
    host.pickedProject = undefined;
    host.readFileCalls = [];
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
    disableSceneViewProfiler();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
});

describe('Editor workbench UI', () => {
    it('opens a picked folder from the welcome page into the workbench', async () => {
        useEditorStore.setState({
            language: 'zh-CN',
            projectName: '模拟项目',
            projectTree: undefined,
            selectedProjectFilePath: undefined,
            openedScenePath: undefined,
            expandedProjectFolders: [],
            expandedHierarchyNodesByScene: {},
        });
        resetCompilerSceneDocument();
        host.pickedProject = projectTree();

        const view = await renderEditorApp({ strict: true });
        try {
            expect(view.container.querySelector('[data-testid="welcome-page"]')).toBeTruthy();

            const openButton = [...view.container.querySelectorAll('button')]
                .find((button) => button.textContent === '打开文件夹');
            expect(openButton).toBeTruthy();
            await act(async () => {
                click(openButton!);
                await Promise.resolve();
                await Promise.resolve();
            });

            expect(view.container.querySelector('[data-testid="editor-workbench"]')).toBeTruthy();
            expect(view.container.querySelector('[data-testid="project-shelf"]')).toBeTruthy();
            expect(view.container.querySelector('[data-testid="workbench-preview"]')).toBeTruthy();
            expect(textContent(view.container)).toContain('GameProject');
        } finally {
            await view.cleanup();
        }
    });

    it('keeps scene view profiling disabled by default', () => {
        expect(sceneViewProfilerEnabled()).toBe(false);
        expect(beginSceneViewProfile('move')).toBeUndefined();
        expect(measureSceneViewProfile('noop', () => 42)).toBe(42);

        enableSceneViewProfiler();
        expect(sceneViewProfilerEnabled()).toBe(true);
        expect(globalThis.pixifactSceneViewProfile?.status().enabled).toBe(true);
        noteSceneViewProfile('pointerdown', {
            canMove: true,
            hitLocator: '0:label',
            selectedLocator: '0:label',
        });
        expect(getSceneViewProfilerSnapshot().lastNote?.meta).toEqual({
            canMove: true,
            hitLocator: '0:label',
            selectedLocator: '0:label',
        });

        disableSceneViewProfiler();
        expect(sceneViewProfilerEnabled()).toBe(false);
    });

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
        expect(moveCompilerSceneNodeProps(
            { x: 10, y: 20 },
            { x: 5, y: -8 },
        )).toEqual({
            x: 15,
            y: 12,
        });
        expect(moveCompilerSceneNodeProps(
            {},
            { x: -12, y: 7 },
        )).toEqual({
            x: -12,
            y: 7,
        });
        expect(canBeginCompilerSceneMove('0:label', '0:label')).toBe(true);
        expect(canBeginCompilerSceneMove('0:label', '1:background')).toBe(false);
        expect(canBeginCompilerSceneMove(undefined, '0:label')).toBe(false);
        expect(canBeginCompilerSceneMove('0:label', undefined)).toBe(false);
        expect(resizeCompilerSceneNodeProps(
            { width: 100, height: 40 },
            { x: 0, y: 0, width: 120, height: 60 },
            'east',
            { x: 30, y: 20 },
        )).toEqual({ width: 130 });
        expect(resizeCompilerSceneNodeProps(
            { width: 100, height: 40 },
            { x: 0, y: 0, width: 120, height: 60 },
            'south',
            { x: 30, y: 20 },
        )).toEqual({ height: 60 });
        expect(resizeCompilerSceneNodeProps(
            {},
            { x: 0, y: 0, width: 120, height: 60 },
            'south-east',
            { x: 30, y: -80 },
        )).toEqual({ width: 150, height: 1 });
        expect(panViewportTransform(
            { scale: 1.5, offset: { x: 40, y: 60 } },
            { x: 20, y: -10 },
        )).toEqual({
            scale: 1.5,
            offset: { x: 60, y: 50 },
        });
        expect(viewportTransformStyle({
            scale: 1.5,
            offset: { x: 60, y: 50 },
        })).toEqual({
            transform: 'translate(60px, 50px) scale(1.5)',
        });
        expect(gridTransformStyle({
            scale: 1.5,
            offset: { x: 60, y: 50 },
        })).toEqual({
            transform: 'translate(-17940px, -17950px) scale(1.5)',
        });
        expect(resizeManualViewportTransform(
            { scale: 1.5, offset: { x: 40, y: 60 } },
            { width: 800, height: 600 },
            { width: 1000, height: 900 },
        )).toEqual({
            scale: 1.5,
            offset: { x: 140, y: 210 },
        });
        expect(compilerScenePreviewEventFeatures).toEqual({
            click: false,
            globalMove: false,
            move: false,
            wheel: false,
        });
    });

    it('uses transformed Pixi bounds directly for compiler viewport selection overlays', () => {
        expect(compilerScenePointInRect({ x: 24, y: 36 }, {
            x: 24,
            y: 36,
            width: 120,
            height: 48,
        })).toBe(true);
        expect(compilerScenePointInRect({ x: 145, y: 36 }, {
            x: 24,
            y: 36,
            width: 120,
            height: 48,
        })).toBe(false);
        expect(isEditableCompilerSceneHitTarget({
            locator: '0:label',
            bounds: {
                x: 24,
                y: 36,
                width: 120,
                height: 48,
            },
        })).toBe(true);
        expect(isEditableCompilerSceneHitTarget({
            locator: '__scene__',
            bounds: {
                x: 0,
                y: 0,
                width: 960,
                height: 540,
            },
        })).toBe(false);
        expect(isEditableCompilerSceneHitTarget({
            locator: '0:panel/slot:default',
            bounds: {
                x: 0,
                y: 0,
                width: 120,
                height: 40,
            },
        })).toBe(false);
        expect(isEditableCompilerSceneHitTarget({
            locator: '0:hidden',
            bounds: {
                x: 0,
                y: 0,
                width: 0,
                height: 40,
            },
        })).toBe(false);
        expect(pickTopCompilerSceneHit([{
            locator: '0:back',
            bounds: {
                x: 0,
                y: 0,
                width: 120,
                height: 80,
            },
        }, {
            locator: '1:front',
            bounds: {
                x: 20,
                y: 20,
                width: 120,
                height: 80,
            },
        }], { x: 40, y: 40 })).toBe('1:front');
        expect(pickTopCompilerSceneHit([{
            locator: '0:back',
            bounds: {
                x: 0,
                y: 0,
                width: 120,
                height: 80,
            },
        }], { x: 200, y: 200 })).toBeUndefined();
        expect(pickCompilerSceneResizeHandle({
            x: 10,
            y: 20,
            width: 100,
            height: 60,
        }, { x: 110, y: 80 })).toBe('south-east');
        expect(pickCompilerSceneResizeHandle({
            x: 10,
            y: 20,
            width: 100,
            height: 60,
        }, { x: 110, y: 50 })).toBe('east');
        expect(pickCompilerSceneResizeHandle({
            x: 10,
            y: 20,
            width: 100,
            height: 60,
        }, { x: 60, y: 80 })).toBe('south');
        expect(pickCompilerSceneResizeHandle({
            x: 10,
            y: 20,
            width: 100,
            height: 60,
        }, { x: 20, y: 30 })).toBeUndefined();
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
            expectDefaultDockviewLayout(dockviewApi);
        } finally {
            await view.cleanup();
        }
    });

    it('resets the current project Dockview layout without closing the opened Scene', async () => {
        let dockviewApi: DockviewApi | undefined;
        const view = await renderEditorApp({ onDockviewReady: (api) => {
            dockviewApi = api;
        } });
        try {
            expectDefaultDockviewLayout(dockviewApi);
            const openedScenePath = useEditorStore.getState().openedScenePath;

            await act(async () => {
                dockviewApi?.clear();
                await Promise.resolve();
            });
            expect(dockviewApi?.toJSON().panels.preview).toBeUndefined();

            const resetLayoutButton = [...view.container.querySelectorAll('button')]
                .find((button) => button.textContent === '重置布局');
            expect(resetLayoutButton).toBeTruthy();
            await act(async () => {
                click(resetLayoutButton!);
                await Promise.resolve();
                await Promise.resolve();
            });

            expectDefaultDockviewLayout(dockviewApi);
            expect(useEditorStore.getState().openedScenePath).toBe(openedScenePath);
            expect(readEditorProjectLayoutState(projectTree())?.dockview?.panels.preview).toBeTruthy();
        } finally {
            await view.cleanup();
        }
    });

    it('restores Dockview layout from project-level UI state', async () => {
        let initialDockviewApi: DockviewApi | undefined;
        const initialView = await renderEditorApp({ onDockviewReady: (api) => {
            initialDockviewApi = api;
        } });
        const savedDockview = initialDockviewApi?.toJSON();
        expect(savedDockview).toBeTruthy();
        await initialView.cleanup();
        localStorage.clear();
        writeEditorProjectLayoutState(projectTree(), {
            dockview: savedDockview!,
        });

        let fromJSON = vi.fn();
        let dockviewApi: DockviewApi | undefined;
        const view = await renderEditorApp({ onDockviewReady: (api) => {
            dockviewApi = api;
            fromJSON = vi.spyOn(api, 'fromJSON');
        } });
        try {
            await act(async () => {
                await Promise.resolve();
                await Promise.resolve();
            });

            expect(fromJSON).toHaveBeenCalledTimes(1);
            expect(fromJSON).toHaveBeenCalledWith(savedDockview);
            expect(dockviewApi?.toJSON().grid.orientation).toBe(savedDockview?.grid.orientation);
            expect(dockviewApi?.toJSON().panels.preview).toBeTruthy();
        } finally {
            await view.cleanup();
        }
    });

    it('wires compiler viewport toolbar controls to visible state', async () => {
        const view = await renderEditorApp();
        try {
            await act(async () => {
                await Promise.resolve();
                await Promise.resolve();
            });
            const viewport = view.container.querySelector('[data-testid="viewport-stage"]');
            const actions = view.container.querySelector('.viewportActions');
            const fitButton = [...(actions?.querySelectorAll('button') ?? [])]
                .find((button) => button.textContent === '适配');
            const gridButton = [...(actions?.querySelectorAll('button') ?? [])]
                .find((button) => button.textContent === '网格');
            const diagnosticsButton = [...(actions?.querySelectorAll('button') ?? [])]
                .find((button) => button.textContent === '诊断');
            const actualSizeButton = [...(actions?.querySelectorAll('button') ?? [])]
                .find((button) => button.textContent === '100%');

            expect(viewport).toBeTruthy();
            expect(actualSizeButton).toBeTruthy();
            expect(fitButton).toBeTruthy();
            expect(gridButton).toBeTruthy();
            expect(diagnosticsButton).toBeTruthy();
            expect(textContent(view.container)).toContain('640x1136');
            expect(fitButton?.getAttribute('aria-pressed')).toBe('true');
            expect(gridButton?.getAttribute('aria-pressed')).toBe('true');
            expect(diagnosticsButton?.getAttribute('aria-pressed')).toBe('false');
            const grid = view.container.querySelector('.compilerSceneGrid');
            const bounds = view.container.querySelector('.compilerSceneBounds');
            const resolutionBounds = view.container.querySelector('.compilerSceneResolutionBounds');
            expect(grid).toBeTruthy();
            expect(bounds).toBeTruthy();
            expect(resolutionBounds).toBeTruthy();
            expect(view.container.querySelectorAll('.compilerSceneResizeHandle')).toHaveLength(0);
            expect(resolutionBounds?.getAttribute('x')).toBe(bounds?.getAttribute('x'));
            expect(resolutionBounds?.getAttribute('y')).toBe(bounds?.getAttribute('y'));
            expect(resolutionBounds?.getAttribute('width')).toBe(bounds?.getAttribute('width'));
            expect(resolutionBounds?.getAttribute('height')).toBe(bounds?.getAttribute('height'));
            const editorStyles = readFileSync('apps/editor/src/styles.css', 'utf8');
            expect(editorStyles).toContain('.canvasWrap {\n    display: flex;\n    min-height: 0;\n    align-items: stretch;\n    justify-content: stretch;\n    background: #e8edf4;\n    padding: 8px;');
            expect(editorStyles).toContain('.compilerSceneGrid {\n    position: absolute;\n    top: 0;\n    left: 0;\n    z-index: 0;');
            expect(editorStyles).toContain('.pixifactCanvas {\n    position: relative;\n    z-index: 1;');
            expect(editorStyles).toContain('.compilerSceneCanvas {\n    pointer-events: none;\n}');
            expect(editorStyles).toContain('.compilerSceneOverlay {\n    position: absolute;\n    inset: 0;\n    z-index: 2;');
            expect(editorStyles).toContain('.compilerSceneResolutionBounds {');
            expect(editorStyles).toContain('.compilerSceneResizeHandle {');
            expect(editorStyles).toContain('.compilerSceneProfilerPanel {\n    position: absolute;');
            expect(editorStyles).toContain('pointer-events: none;');

            await act(async () => {
                click(diagnosticsButton!);
            });

            expect(diagnosticsButton?.getAttribute('aria-pressed')).toBe('true');
            expect(view.container.querySelector('.compilerSceneProfilerPanel')).toBeTruthy();
            expect(textContent(view.container)).toContain('Scene View 诊断');
            expect(textContent(view.container)).toContain('拖动已选中节点后显示耗时。');

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

    it('keeps non-entry compiler scenes on their natural preview size', async () => {
        host.files.set('GameProject/pixifact.project.json', JSON.stringify({
            version: 1,
            name: 'Game Project',
            resolution: {
                width: 640,
                height: 1136,
            },
            scenes: {
                mainMenu: 'src/scenes/MainMenu.scene',
            },
        }));
        const view = await renderEditorApp();
        try {
            await act(async () => {
                await Promise.resolve();
                await Promise.resolve();
            });

            expect(textContent(view.container)).toContain('960x540');
        } finally {
            await view.cleanup();
        }
    });

    it('does not re-read compiler scene binding status for node coordinate updates', async () => {
        const container = document.createElement('div');
        document.body.append(container);
        const root = createRoot(container);
        try {
            await act(async () => {
                root.render(createElement(InspectorPanel));
                await Promise.resolve();
                await Promise.resolve();
            });

            expect(host.readFileCalls).toEqual([
                'GameProject/src/scenes/Button.scene',
                'GameProject/src/scenes/Button.ts',
                'GameProject/src/scenes/Child.scene',
                'GameProject/src/scenes/Child.ts',
            ]);
            host.readFileCalls = [];
            selectCompilerSceneNode('0:label');

            await act(async () => {
                updateCompilerSceneNodePropsInPlace('0:label', { x: 24, y: 36 });
                await Promise.resolve();
                await Promise.resolve();
            });

            expect(host.readFileCalls).toEqual([]);
            expect((container.querySelector('[data-field-key="x"] input') as HTMLInputElement | null)?.value).toBe('24');
            expect((container.querySelector('[data-field-key="y"] input') as HTMLInputElement | null)?.value).toBe('36');
        } finally {
            await act(async () => {
                root.unmount();
            });
            container.remove();
        }
    });

    it('selects compiler scene nodes from viewport clicks and clears on empty space', async () => {
        expect(getCompilerSceneDocument()?.selection).toEqual({ type: 'scene' });

        expect(selectCompilerSceneViewportHit([{
            locator: '0:label',
            bounds: {
                x: 0,
                y: 0,
                width: 120,
                height: 40,
            },
        }], { x: 24, y: 20 })).toEqual({
            type: 'node',
            node: '0:label',
        });
        expect(getCompilerSceneDocument()?.selection).toEqual({
            type: 'node',
            node: '0:label',
        });

        expect(selectCompilerSceneViewportHit([{
            locator: '0:label',
            bounds: {
                x: 0,
                y: 0,
                width: 120,
                height: 40,
            },
        }], { x: 240, y: 200 })).toEqual({ type: 'scene' });
        expect(getCompilerSceneDocument()?.selection).toEqual({ type: 'scene' });
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
            expect(host.files.get('GameProject/src/scenes/StatusPanel.scene')).toBe('<Scene name="StatusPanel">\n</Scene>\n');
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
