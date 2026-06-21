import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../apps/editor/src/editorStore';
import {
    getCompilerSceneDocument,
    loadCompilerSceneDocument,
    resetCompilerSceneDocument,
    selectCompilerSceneNode,
    undoCompilerSceneCommand,
} from '../apps/editor/src/document/compilerSceneDocumentController';
import { InspectorPanel } from '../apps/editor/src/panels/InspectorPanel';
import { CompilerSceneViewport } from '../apps/editor/src/preview/CompilerSceneViewport';
import type { ProjectFileTreeNode } from '../apps/editor/src/services/projectFileTree';
import { parseSceneTemplate } from '../packages/pixifact/src/compiler/templateParser';

const mockPixi = vi.hoisted(() => {
    class MockContainer {
        box = { x: 0, y: 0, width: 120, height: 28 };
        children: MockContainer[] = [];
        position = {
            set: (x: number, y: number) => {
                this.box.x = x;
                this.box.y = y;
            },
        };
        scale = {
            set: vi.fn(),
        };

        addChild(child: MockContainer) {
            this.children.push(child);
            return child;
        }

        destroy() {}

        getBounds() {
            return this.box;
        }

        set width(value: number) {
            this.box.width = value;
        }

        get width() {
            return this.box.width;
        }

        set height(value: number) {
            this.box.height = value;
        }

        get height() {
            return this.box.height;
        }
    }

    class MockGraphics extends MockContainer {
        clear() {
            return this;
        }

        rect(_x: number, _y: number, width: number, height: number) {
            this.box.width = width;
            this.box.height = height;
            return this;
        }

        roundRect(_x: number, _y: number, width: number, height: number, _radius: number) {
            this.box.width = width;
            this.box.height = height;
            return this;
        }

        fill() {
            return this;
        }

        stroke() {
            return this;
        }
    }

    class MockTextureSource {
        width = 0;
        height = 0;

        constructor(options: { width?: number; height?: number } = {}) {
            this.width = options.width ?? 0;
            this.height = options.height ?? 0;
        }
    }

    class MockTexture {
        static EMPTY = new MockTexture();
        static WHITE = new MockTexture();
        width = 0;
        height = 0;

        constructor(options: { source?: MockTextureSource } = {}) {
            this.width = options.source?.width ?? 0;
            this.height = options.source?.height ?? 0;
        }

        on() {
            return this;
        }

        off() {
            return this;
        }
    }

    class MockMeshGeometry {
        positions: Float32Array;
        uvs: Float32Array;
        indices: Uint32Array;

        constructor(options: { positions?: Float32Array; uvs?: Float32Array; indices?: Uint32Array } = {}) {
            this.positions = options.positions ?? new Float32Array(8);
            this.uvs = options.uvs ?? new Float32Array(8);
            this.indices = options.indices ?? new Uint32Array(6);
        }
    }

    class MockMesh extends MockContainer {
        allowChildren = false;
        geometry: MockMeshGeometry;
        texture: MockTexture;

        constructor(options: { geometry?: MockMeshGeometry; texture?: MockTexture } = {}) {
            super();
            this.geometry = options.geometry ?? new MockMeshGeometry();
            this.texture = options.texture ?? MockTexture.EMPTY;
        }
    }

    class MockObservablePoint {
        x = 0;
        y = 0;

        constructor(private readonly observer: { _onUpdate?: () => void } = {}, x = 0, y = 0) {
            this.x = x;
            this.y = y;
        }

        set(x = 0, y = x) {
            this.x = x;
            this.y = y;
            this.observer._onUpdate?.();
            return this;
        }
    }

    class MockNineSliceSprite extends MockContainer {
        allowChildren = false;
        anchor = new MockObservablePoint();
        texture: MockTexture;
        leftWidth = 10;
        rightWidth = 10;
        topHeight = 10;
        bottomHeight = 10;

        constructor(options: { texture?: MockTexture; width?: number; height?: number; leftWidth?: number; rightWidth?: number; topHeight?: number; bottomHeight?: number } = {}) {
            super();
            this.texture = options.texture ?? MockTexture.EMPTY;
            this.width = options.width ?? 100;
            this.height = options.height ?? 100;
            this.leftWidth = options.leftWidth ?? this.leftWidth;
            this.rightWidth = options.rightWidth ?? this.rightWidth;
            this.topHeight = options.topHeight ?? this.topHeight;
            this.bottomHeight = options.bottomHeight ?? this.bottomHeight;
        }

        setSize(width: number, height = width) {
            this.width = width;
            this.height = height;
        }

        getSize() {
            return { width: this.width, height: this.height };
        }
    }

    class MockTilingSprite extends MockContainer {
        allowChildren = false;
        anchor = new MockObservablePoint();
        tilePosition = new MockObservablePoint();
        tileScale = new MockObservablePoint({}, 1, 1);
        tileRotation = 0;
        texture: MockTexture;

        constructor(options: { texture?: MockTexture; width?: number; height?: number } = {}) {
            super();
            this.texture = options.texture ?? MockTexture.EMPTY;
            this.width = options.width ?? 256;
            this.height = options.height ?? 256;
        }

        setSize(width: number, height = width) {
            this.width = width;
            this.height = height;
        }

        getSize() {
            return { width: this.width, height: this.height };
        }
    }

    class MockApplication {
        canvas = document.createElement('canvas');
        renderer = {
            resize: vi.fn(),
        };
        stage = new MockContainer();

        async init() {}

        destroy() {}
    }

    const label = new MockContainer();
    const root = new MockContainer();
    return {
        Application: MockApplication,
        Container: MockContainer,
        Graphics: MockGraphics,
        Mesh: MockMesh,
        MeshGeometry: MockMeshGeometry,
        NineSliceSprite: MockNineSliceSprite,
        ObservablePoint: MockObservablePoint,
        Texture: MockTexture,
        TextureSource: MockTextureSource,
        TilingSprite: MockTilingSprite,
        label,
        root,
    };
});

vi.mock('pixi.js', () => ({
    Application: mockPixi.Application,
    Container: mockPixi.Container,
    Graphics: mockPixi.Graphics,
    Mesh: mockPixi.Mesh,
    MeshGeometry: mockPixi.MeshGeometry,
    NineSliceSprite: mockPixi.NineSliceSprite,
    ObservablePoint: mockPixi.ObservablePoint,
    Texture: mockPixi.Texture,
    TextureSource: mockPixi.TextureSource,
    TilingSprite: mockPixi.TilingSprite,
}));

vi.mock('../apps/editor/src/preview/compilerSceneRuntimePreview', () => ({
    createCompilerSceneRuntimePreview: vi.fn(async () => ({
        dispose: vi.fn(),
        height: 540,
        nodes: new Map([['0:label', mockPixi.label]]),
        root: mockPixi.root,
        width: 960,
    })),
    destroyCompilerSceneRuntimePreview: vi.fn(),
}));

vi.mock('../apps/editor/src/services/hostBridge', () => ({
    hostErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
    openHostCodeFile: vi.fn(async () => {}),
    readHostProjectFileText: vi.fn(async () => ''),
}));

function projectTree(): ProjectFileTreeNode {
    return {
        id: 'GameProject',
        name: 'GameProject',
        path: 'GameProject',
        kind: 'folder',
        depth: 0,
        projectRootPath: '/repo/GameProject',
        systemPath: '/repo/GameProject',
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
                children: [{
                    id: 'GameProject/src/scenes/Button.scene',
                    name: 'Button.scene',
                    path: 'GameProject/src/scenes/Button.scene',
                    kind: 'scene',
                    depth: 3,
                }],
            }],
        }],
    };
}

function currentScene() {
    return [
        '<Scene name="Button">',
        '  <Text id="label" text="Start" x="10" y="20" />',
        '</Scene>',
        '',
    ].join('\n');
}

function loadScene() {
    const tree = projectTree();
    useEditorStore.setState({
        language: 'zh-CN',
        projectName: 'GameProject',
        projectTree: tree,
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

function pointerEvent(type: string, options: PointerEventInit & { pointerId: number }) {
    if (typeof PointerEvent === 'function') {
        return new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1,
            pointerType: 'mouse',
            ...options,
        });
    }
    const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
        clientX: options.clientX,
        clientY: options.clientY,
    }) as MouseEvent & Partial<PointerEvent>;
    Object.defineProperty(event, 'pointerId', { value: options.pointerId });
    Object.defineProperty(event, 'pointerType', { value: options.pointerType ?? 'mouse' });
    return event;
}

async function renderResizeHarness() {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
        root.render(createElement('div', null,
            createElement(CompilerSceneViewport, {
                document: getCompilerSceneDocument()!,
                projectTree: projectTree(),
            }),
            createElement(InspectorPanel),
        ));
        await Promise.resolve();
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

describe('Scene View resize UI', () => {
    beforeEach(() => {
        localStorage.clear();
        resetCompilerSceneDocument();
        mockPixi.label.box = { x: 10, y: 20, width: 120, height: 28 };
        mockPixi.root.box = { x: 0, y: 0, width: 120, height: 28 };
        mockPixi.root.children = [];
        loadScene();
    });

    afterEach(() => {
        resetCompilerSceneDocument();
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
        document.body.innerHTML = '';
    });

    it('resizes the selected node from the south-east handle and supports undo', async () => {
        selectCompilerSceneNode('0:label');
        const view = await renderResizeHarness();
        try {
            const host = view.container.querySelector('.pixifactViewportHost') as HTMLElement | null;
            const handle = view.container.querySelector('.compilerSceneResizeHandle--south-east') as SVGRectElement | null;
            const xInput = view.container.querySelector('input[aria-label="x"]') as HTMLInputElement | null;
            const yInput = view.container.querySelector('input[aria-label="y"]') as HTMLInputElement | null;
            const widthInput = view.container.querySelector('input[aria-label="width"]') as HTMLInputElement | null;
            const heightInput = view.container.querySelector('input[aria-label="height"]') as HTMLInputElement | null;
            expect(host).toBeTruthy();
            expect(handle).toBeTruthy();
            expect(xInput?.value).toBe('10');
            expect(yInput?.value).toBe('20');
            expect(widthInput?.value).toBe('120');
            expect(heightInput?.value).toBe('28');

            const startX = Number(handle!.getAttribute('x')) + Number(handle!.getAttribute('width')) / 2;
            const startY = Number(handle!.getAttribute('y')) + Number(handle!.getAttribute('height')) / 2;
            await act(async () => {
                handle!.dispatchEvent(pointerEvent('pointerdown', {
                    clientX: startX,
                    clientY: startY,
                    pointerId: 9,
                }));
                host!.dispatchEvent(pointerEvent('pointermove', {
                    clientX: startX + 30,
                    clientY: startY + 18,
                    pointerId: 9,
                }));
                host!.dispatchEvent(pointerEvent('pointerup', {
                    clientX: startX + 30,
                    clientY: startY + 18,
                    pointerId: 9,
                }));
                await Promise.resolve();
            });

            expect(getCompilerSceneDocument()?.template.children[0].props).toMatchObject({
                x: 10,
                y: 20,
                width: 150,
                height: 46,
            });
            expect(xInput?.value).toBe('10');
            expect(yInput?.value).toBe('20');
            expect(widthInput?.value).toBe('150');
            expect(heightInput?.value).toBe('46');

            await act(async () => {
                expect(undoCompilerSceneCommand()?.ok).toBe(true);
                await Promise.resolve();
            });

            expect(getCompilerSceneDocument()?.template.children[0].props).toMatchObject({
                x: 10,
                y: 20,
            });
            expect(getCompilerSceneDocument()?.template.children[0].props.width).toBeUndefined();
            expect(getCompilerSceneDocument()?.template.children[0].props.height).toBeUndefined();
            expect(xInput?.value).toBe('10');
            expect(yInput?.value).toBe('20');
            expect(widthInput?.value).toBe('120');
            expect(heightInput?.value).toBe('28');
        } finally {
            await view.cleanup();
        }
    });

    it('resizes the selected node from the north-west handle and keeps the opposite corner fixed', async () => {
        selectCompilerSceneNode('0:label');
        const view = await renderResizeHarness();
        try {
            const host = view.container.querySelector('.pixifactViewportHost') as HTMLElement | null;
            const handle = view.container.querySelector('.compilerSceneResizeHandle--north-west') as SVGRectElement | null;
            const xInput = view.container.querySelector('input[aria-label="x"]') as HTMLInputElement | null;
            const yInput = view.container.querySelector('input[aria-label="y"]') as HTMLInputElement | null;
            const widthInput = view.container.querySelector('input[aria-label="width"]') as HTMLInputElement | null;
            const heightInput = view.container.querySelector('input[aria-label="height"]') as HTMLInputElement | null;
            expect(host).toBeTruthy();
            expect(handle).toBeTruthy();
            expect(xInput?.value).toBe('10');
            expect(yInput?.value).toBe('20');
            expect(widthInput?.value).toBe('120');
            expect(heightInput?.value).toBe('28');

            const startX = Number(handle!.getAttribute('x')) + Number(handle!.getAttribute('width')) / 2;
            const startY = Number(handle!.getAttribute('y')) + Number(handle!.getAttribute('height')) / 2;
            await act(async () => {
                handle!.dispatchEvent(pointerEvent('pointerdown', {
                    clientX: startX,
                    clientY: startY,
                    pointerId: 10,
                }));
                host!.dispatchEvent(pointerEvent('pointermove', {
                    clientX: startX + 30,
                    clientY: startY + 8,
                    pointerId: 10,
                }));
                host!.dispatchEvent(pointerEvent('pointerup', {
                    clientX: startX + 30,
                    clientY: startY + 8,
                    pointerId: 10,
                }));
                await Promise.resolve();
            });

            expect(getCompilerSceneDocument()?.template.children[0].props).toMatchObject({
                x: 40,
                y: 28,
                width: 90,
                height: 20,
            });
            expect(xInput?.value).toBe('40');
            expect(yInput?.value).toBe('28');
            expect(widthInput?.value).toBe('90');
            expect(heightInput?.value).toBe('20');

            await act(async () => {
                expect(undoCompilerSceneCommand()?.ok).toBe(true);
                await Promise.resolve();
            });

            expect(getCompilerSceneDocument()?.template.children[0].props).toMatchObject({
                x: 10,
                y: 20,
            });
            expect(getCompilerSceneDocument()?.template.children[0].props.width).toBeUndefined();
            expect(getCompilerSceneDocument()?.template.children[0].props.height).toBeUndefined();
            expect(xInput?.value).toBe('10');
            expect(yInput?.value).toBe('20');
            expect(widthInput?.value).toBe('120');
            expect(heightInput?.value).toBe('28');
        } finally {
            await view.cleanup();
        }
    });
});
