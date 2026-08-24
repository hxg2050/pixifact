import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h, markRaw, ref, watch } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseSceneTemplate, type SceneTemplateInterface } from 'pixifact/compiler';
import EditorApp from '../apps/editor/src/EditorApp.vue';
import AssetsPanel from '../apps/editor/src/panels/AssetsPanel.vue';
import HierarchyPanel from '../apps/editor/src/panels/HierarchyPanel.vue';
import InspectorPanel from '../apps/editor/src/panels/InspectorPanel.vue';
import { SceneDocument } from '../apps/editor/src/document/SceneDocument';
import { createSceneAssetNode, duplicateSceneNode } from '../apps/editor/src/document/sceneTree';
import { useEditorUiStore } from '../apps/editor/src/stores/editorUi';

const source = [
    '<Scene name="Menu">',
    '  <Text id="title" x="20" text="开始" />',
    '</Scene>',
    '',
].join('\n');

function createApi() {
    return {
        readScene: vi.fn(async () => ({
            path: 'src/scenes/Menu.scene',
            source,
            version: 'sha256:before',
        })),
        writeScene: vi.fn(async () => ({
            path: 'src/scenes/Menu.scene',
            version: 'sha256:after',
        })),
    };
}

class AcceptedEditorWebSocket {
    static readonly OPEN = 1;
    static initialMessage: Record<string, unknown> = {
        type: 'editorSessionActive',
        protocolVersion: 3,
    };
    static instances: AcceptedEditorWebSocket[] = [];
    readonly listeners = new Map<string, Array<(event: { data?: string }) => void>>();
    readonly sent: string[] = [];
    readyState = AcceptedEditorWebSocket.OPEN;

    constructor(_url: string) {
        AcceptedEditorWebSocket.instances.push(this);
        queueMicrotask(() => this.emit('message', JSON.stringify(AcceptedEditorWebSocket.initialMessage)));
    }

    addEventListener(type: string, listener: (event: { data?: string }) => void) {
        const listeners = this.listeners.get(type) ?? [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
    }

    send(data: string) {
        this.sent.push(data);
    }

    close() {
        this.readyState = 3;
        this.emit('close');
    }

    emit(type: string, data?: string) {
        for (const listener of this.listeners.get(type) ?? []) {
            listener({ data });
        }
    }
}

afterEach(() => {
    AcceptedEditorWebSocket.initialMessage = {
        type: 'editorSessionActive',
        protocolVersion: 3,
    };
    AcceptedEditorWebSocket.instances = [];
    vi.unstubAllGlobals();
});

describe('Editor Vue UI', () => {
    it('allows a standby tab to take over and deactivates it when control moves again', async () => {
        const project = {
            name: 'adventure-ui-demo',
            root: '/demo',
            scenes: ['src/scenes/Menu.scene'],
            images: [],
            files: [
                { kind: 'scene', path: 'src/scenes/Menu.scene' },
                { kind: 'script', path: 'src/scenes/Menu.ts' },
            ],
        };
        const fetcher = vi.fn(async (input: string | URL | Request) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
            if (url === '/api/project') return Response.json(project);
            if (url === '/api/editor-ui-state') return Response.json({});
            if (url === '/api/scene-bindings') return Response.json({});
            if (url.startsWith('/api/scene?')) {
                return Response.json({
                    path: 'src/scenes/Menu.scene',
                    source,
                    version: 'sha256:before',
                });
            }
            throw new Error(`Unexpected Editor request: ${url}`);
        });
        AcceptedEditorWebSocket.initialMessage = {
            type: 'editorSessionStandby',
            protocolVersion: 3,
            resume: {
                scenePath: 'src/scenes/Menu.scene',
                selectedLocator: '0:title',
            },
        };
        vi.stubGlobal('fetch', fetcher);
        vi.stubGlobal('WebSocket', AcceptedEditorWebSocket);
        const pinia = createPinia();
        setActivePinia(pinia);
        const wrapper = mount(EditorApp, {
            global: {
                plugins: [pinia],
                stubs: { SceneCanvas: true },
            },
        });

        await vi.waitFor(() => expect(wrapper.find('button[aria-label="在此接管"]').exists()).toBe(true));
        expect(wrapper.text()).toContain('adventure-ui-demo');
        expect(wrapper.text()).toContain('src/scenes/Menu.scene');
        await wrapper.get('button[aria-label="在此接管"]').trigger('click');
        expect(JSON.parse(AcceptedEditorWebSocket.instances[0].sent[0])).toEqual({
            type: 'editorSessionTakeoverRequested',
            protocolVersion: 3,
        });

        AcceptedEditorWebSocket.instances[0].emit('message', JSON.stringify({
            type: 'editorSessionActive',
            protocolVersion: 3,
            resume: {
                scenePath: 'src/scenes/Menu.scene',
                selectedLocator: '0:title',
            },
        }));
        await vi.waitFor(() => expect(wrapper.find('.editor-shell').exists()).toBe(true));
        expect(useEditorUiStore().selectedLocator).toBe('0:title');

        AcceptedEditorWebSocket.instances[0].emit('message', JSON.stringify({
            type: 'editorSessionStandby',
            protocolVersion: 3,
            reason: 'takenOver',
            resume: {
                scenePath: 'src/scenes/Menu.scene',
                selectedLocator: '0:title',
            },
        }));
        await vi.waitFor(() => expect(wrapper.find('button[aria-label="重新接管"]').exists()).toBe(true));
        expect(wrapper.text()).toContain('此标签页已停止编辑');
        wrapper.unmount();
    });

    it('navigates into Scene Instances and restores selection and canvas view', async () => {
        const menuSource = [
            '<Scene name="Menu">',
            '  <Button id="button" scene="./Button.scene" />',
            '</Scene>',
            '',
        ].join('\n');
        const buttonSource = [
            '<Scene name="Button">',
            '  <Text id="label" text="按钮" />',
            '</Scene>',
            '',
        ].join('\n');
        const dialogSource = [
            '<Scene name="Dialog">',
            '  <Text id="message" text="提示" />',
            '</Scene>',
            '',
        ].join('\n');
        const project = {
            name: 'demo',
            root: '/demo',
            scenes: [
                'src/scenes/Menu.scene',
                'src/scenes/Button.scene',
                'src/scenes/Dialog.scene',
            ],
            images: [],
            files: [
                { kind: 'scene', path: 'src/scenes/Menu.scene' },
                { kind: 'script', path: 'src/scenes/Menu.ts' },
                { kind: 'scene', path: 'src/scenes/Button.scene' },
                { kind: 'script', path: 'src/scenes/Button.ts' },
                { kind: 'scene', path: 'src/scenes/Dialog.scene' },
                { kind: 'script', path: 'src/scenes/Dialog.ts' },
            ],
        };
        const sources = new Map([
            ['src/scenes/Menu.scene', menuSource],
            ['src/scenes/Button.scene', buttonSource],
            ['src/scenes/Dialog.scene', dialogSource],
        ]);
        const fetcher = vi.fn(async (input: string | URL | Request) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
            if (url === '/api/project') return Response.json(project);
            if (url === '/api/editor-ui-state') return Response.json({});
            if (url === '/api/scene-bindings') return Response.json({});
            if (url.startsWith('/api/scene?')) {
                const scenePath = new URL(url, 'http://localhost').searchParams.get('path')!;
                return Response.json({
                    path: scenePath,
                    source: sources.get(scenePath),
                    version: `sha256:${scenePath}`,
                });
            }
            throw new Error(`Unexpected Editor request: ${url}`);
        });
        const menuView = { scale: 0.75, x: 24, y: 36 };
        const buttonView = { scale: 1.5, x: -18, y: 12 };
        let canvasView = { scale: 1, x: 0, y: 0 };
        const captureView = vi.fn(() => ({ ...canvasView }));
        const restoreView = vi.fn((next: typeof canvasView) => {
            canvasView = { ...next };
        });
        const SceneCanvasStub = defineComponent({
            props: { document: Object },
            setup(_props, { expose }) {
                expose({ captureView, restoreView });
                return () => h('div', { 'data-testid': 'scene-canvas' });
            },
        });
        vi.stubGlobal('fetch', fetcher);
        vi.stubGlobal('WebSocket', AcceptedEditorWebSocket);
        const pinia = createPinia();
        setActivePinia(pinia);
        const wrapper = mount(EditorApp, {
            global: {
                plugins: [pinia],
                stubs: { SceneCanvas: SceneCanvasStub },
            },
        });

        await vi.waitFor(() => expect(wrapper.find('[data-locator="0:button"]').exists()).toBe(true));
        expect(wrapper.get('button[aria-label="返回"]').attributes('disabled')).toBeDefined();
        expect(wrapper.get('button[aria-label="前进"]').attributes('disabled')).toBeDefined();
        await wrapper.get('[data-locator="0:button"]').trigger('click');
        canvasView = menuView;
        await wrapper.get('[data-locator="0:button"]').trigger('dblclick');

        await vi.waitFor(() => expect(wrapper.find('[data-locator="0:label"]').exists()).toBe(true));
        expect(useEditorUiStore().currentScenePath).toBe('src/scenes/Button.scene');
        expect(wrapper.get('button[aria-label="返回"]').attributes('disabled')).toBeUndefined();
        await wrapper.get('[data-locator="0:label"]').trigger('click');
        canvasView = buttonView;
        await wrapper.get('button[aria-label="返回"]').trigger('click');

        await vi.waitFor(() => expect(wrapper.find('[data-locator="0:button"]').exists()).toBe(true));
        expect(useEditorUiStore().selectedLocator).toBe('0:button');
        expect(canvasView).toEqual(menuView);
        expect(restoreView).toHaveBeenLastCalledWith(menuView);
        expect(wrapper.get('button[aria-label="前进"]').attributes('disabled')).toBeUndefined();
        await wrapper.get('button[aria-label="前进"]').trigger('click');

        await vi.waitFor(() => expect(wrapper.find('[data-locator="0:label"]').exists()).toBe(true));
        expect(useEditorUiStore().selectedLocator).toBe('0:label');
        expect(canvasView).toEqual(buttonView);
        expect(restoreView).toHaveBeenLastCalledWith(buttonView);

        await wrapper.get('button[aria-label="返回"]').trigger('click');
        await vi.waitFor(() => expect(wrapper.find('[data-locator="0:button"]').exists()).toBe(true));
        useEditorUiStore().activeLeftTab = 'assets';
        await flushPromises();
        await wrapper.get('[data-asset-path="src/scenes/Dialog.scene"]').trigger('dblclick');
        await vi.waitFor(() => expect(useEditorUiStore().currentScenePath).toBe('src/scenes/Dialog.scene'));
        useEditorUiStore().activeLeftTab = 'hierarchy';
        await flushPromises();
        expect(wrapper.find('[data-locator="0:message"]').exists()).toBe(true);
        expect(wrapper.get('button[aria-label="前进"]').attributes('disabled')).toBeDefined();
        wrapper.unmount();
    });

    it('manually reloads project context and rebuilds the current preview', async () => {
        const project = {
            name: 'demo',
            root: '/demo',
            scenes: ['src/scenes/Menu.scene'],
            images: ['assets/icon.png'],
            files: [
                { kind: 'scene', path: 'src/scenes/Menu.scene' },
                { kind: 'script', path: 'src/scenes/Menu.ts' },
                { kind: 'image', path: 'assets/icon.png' },
            ],
        };
        const bindings = {
            'src/scenes/Menu.scene': {
                className: 'Menu',
                interface: { props: {}, events: {}, slots: {} },
            },
        };
        let diskSource = source;
        let diskVersion = 'sha256:before';
        const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
            if (url === '/api/project') return Response.json(project);
            if (url === '/api/editor-ui-state') return Response.json({});
            if (url === '/api/scene-bindings') return Response.json(bindings);
            if (url.startsWith('/api/scene?')) {
                if (init?.method === 'PUT') {
                    const body = JSON.parse(String(init.body)) as { source: string };
                    diskSource = body.source;
                    diskVersion = 'sha256:after';
                    return Response.json({ path: 'src/scenes/Menu.scene', version: diskVersion });
                }
                return Response.json({
                    path: 'src/scenes/Menu.scene',
                    source: diskSource,
                    version: diskVersion,
                });
            }
            throw new Error(`Unexpected Editor request: ${url}`);
        });
        vi.stubGlobal('fetch', fetcher);
        vi.stubGlobal('WebSocket', AcceptedEditorWebSocket);
        const previewRefreshes = vi.fn();
        const SceneCanvasStub = defineComponent({
            props: { projectTree: Object },
            setup(props) {
                watch(() => props.projectTree, () => previewRefreshes());
                return () => h('div', { 'data-testid': 'scene-canvas' });
            },
        });
        const pinia = createPinia();
        setActivePinia(pinia);
        const wrapper = mount(EditorApp, {
            global: {
                plugins: [pinia],
                stubs: { SceneCanvas: SceneCanvasStub },
            },
        });
        await vi.waitFor(() => expect(wrapper.find('button[aria-label="刷新"]').exists()).toBe(true));
        await flushPromises();
        const ui = useEditorUiStore();
        ui.selectedLocator = '0:title';
        await flushPromises();
        const xInput = wrapper.get('input[data-prop="x"]');
        (xInput.element as HTMLInputElement).value = '48';
        await xInput.trigger('input');
        await xInput.trigger('blur');
        await vi.waitFor(() => expect(wrapper.get('button[aria-label="撤销"]').attributes('disabled')).toBeUndefined());
        await vi.waitFor(() => expect(wrapper.get('button[aria-label="刷新"]').attributes('disabled')).toBeUndefined());
        const previousPreviewRefreshes = previewRefreshes.mock.calls.length;

        await wrapper.get('button[aria-label="刷新"]').trigger('click');
        await vi.waitFor(() => expect(previewRefreshes.mock.calls.length).toBeGreaterThan(previousPreviewRefreshes));

        const urls = fetcher.mock.calls.map(([input]) => (
            typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        ));
        expect(urls.filter((url) => url === '/api/project')).toHaveLength(2);
        expect(urls.filter((url) => url === '/api/scene-bindings')).toHaveLength(2);
        expect(fetcher.mock.calls.filter(([input, init]) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
            return url.startsWith('/api/scene?') && init?.method !== 'PUT';
        })).toHaveLength(2);
        expect(ui.selectedLocator).toBe('0:title');
        expect(wrapper.get('button[aria-label="撤销"]').attributes('disabled')).toBeUndefined();
        wrapper.unmount();
    });

    it('runs global editing shortcuts without intercepting Inspector inputs', async () => {
        const project = {
            name: 'demo',
            root: '/demo',
            scenes: ['src/scenes/Menu.scene'],
            images: [],
            files: [
                { kind: 'scene', path: 'src/scenes/Menu.scene' },
                { kind: 'script', path: 'src/scenes/Menu.ts' },
            ],
        };
        let diskSource = source;
        let version = 0;
        const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
            if (url === '/api/project') return Response.json(project);
            if (url === '/api/editor-ui-state') return Response.json({});
            if (url === '/api/scene-bindings') return Response.json({});
            if (url.startsWith('/api/scene?')) {
                if (init?.method === 'PUT') {
                    diskSource = (JSON.parse(String(init.body)) as { source: string }).source;
                    version += 1;
                    return Response.json({
                        path: 'src/scenes/Menu.scene',
                        version: `sha256:${version}`,
                    });
                }
                return Response.json({
                    path: 'src/scenes/Menu.scene',
                    source: diskSource,
                    version: `sha256:${version}`,
                });
            }
            throw new Error(`Unexpected Editor request: ${url}`);
        });
        vi.stubGlobal('fetch', fetcher);
        vi.stubGlobal('WebSocket', AcceptedEditorWebSocket);
        const pinia = createPinia();
        setActivePinia(pinia);
        const host = document.createElement('div');
        document.body.append(host);
        const wrapper = mount(EditorApp, {
            attachTo: host,
            global: {
                plugins: [pinia],
                stubs: { SceneCanvas: true },
            },
        });
        const writeCount = () => fetcher.mock.calls.filter(([, init]) => init?.method === 'PUT').length;
        const pressWindowKey = (init: KeyboardEventInit) => {
            const event = new KeyboardEvent('keydown', {
                bubbles: true,
                cancelable: true,
                ...init,
            });
            window.dispatchEvent(event);
            return event;
        };

        await vi.waitFor(() => expect(wrapper.find('[data-locator="0:title"]').exists()).toBe(true));
        await wrapper.get('[data-locator="0:title"]').trigger('click');
        const xInput = wrapper.get('input[data-prop="x"]');
        const inputDuplicate = new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            code: 'KeyD',
            ctrlKey: true,
            key: 'd',
        });
        xInput.element.dispatchEvent(inputDuplicate);
        xInput.element.dispatchEvent(new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            code: 'Backspace',
            key: 'Backspace',
        }));
        await flushPromises();
        expect(inputDuplicate.defaultPrevented).toBe(false);
        expect(writeCount()).toBe(0);
        expect(useEditorUiStore().selectedLocator).toBe('0:title');

        expect(pressWindowKey({ code: 'KeyD', ctrlKey: true, key: 'd' }).defaultPrevented).toBe(true);
        await vi.waitFor(() => expect(wrapper.find('[data-locator="1:title2"]').exists()).toBe(true));
        expect(writeCount()).toBe(1);

        const duplicateInput = wrapper.get('input[data-prop="x"]');
        duplicateInput.element.dispatchEvent(new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            code: 'KeyZ',
            key: 'z',
            metaKey: true,
        }));
        await flushPromises();
        expect(wrapper.find('[data-locator="1:title2"]').exists()).toBe(true);
        expect(writeCount()).toBe(1);

        pressWindowKey({ code: 'KeyZ', key: 'z', metaKey: true });
        await vi.waitFor(() => expect(wrapper.find('[data-locator="1:title2"]').exists()).toBe(false));
        expect(writeCount()).toBe(2);
        pressWindowKey({ code: 'KeyZ', ctrlKey: true, key: 'z', shiftKey: true });
        await vi.waitFor(() => expect(wrapper.find('[data-locator="1:title2"]').exists()).toBe(true));
        expect(writeCount()).toBe(3);

        pressWindowKey({ code: 'Delete', key: 'Delete' });
        await vi.waitFor(() => expect(wrapper.find('[data-locator="1:title2"]').exists()).toBe(false));
        expect(writeCount()).toBe(4);
        await wrapper.get('[data-locator="0:title"]').trigger('click');
        pressWindowKey({ code: 'KeyD', ctrlKey: true, key: 'd' });
        await vi.waitFor(() => expect(wrapper.find('[data-locator="1:title2"]').exists()).toBe(true));
        pressWindowKey({ code: 'Backspace', key: 'Backspace' });
        await vi.waitFor(() => expect(wrapper.find('[data-locator="1:title2"]').exists()).toBe(false));
        expect(writeCount()).toBe(6);

        await wrapper.get('[data-locator="0:title"]').trigger('pointerdown');
        expect(wrapper.get('.hierarchy-panel').classes()).toContain('is-dragging');
        expect(pressWindowKey({ code: 'Escape', key: 'Escape' }).defaultPrevented).toBe(true);
        await flushPromises();
        expect(wrapper.get('.hierarchy-panel').classes()).not.toContain('is-dragging');
        expect(useEditorUiStore().selectedLocator).toBe('0:title');
        pressWindowKey({ code: 'Escape', key: 'Escape' });
        expect(useEditorUiStore().selectedLocator).toBeUndefined();
        expect(writeCount()).toBe(6);
        wrapper.unmount();
        host.remove();
    });

    it('creates Image and Scene Instance nodes from indexed project assets', () => {
        const template = parseSceneTemplate([
            '<Scene name="Menu">',
            '  <Image id="image" texture="assets/existing.png" />',
            '  <Button id="button" scene="src/scenes/Button.scene" />',
            '</Scene>',
        ].join('\n'));

        expect(createSceneAssetNode(template, {
            kind: 'image',
            path: 'assets/icons/map.svg',
        }, { x: 24, y: 36 })).toMatchObject({
            kind: 'pixi',
            type: 'Image',
            id: 'image2',
            props: {
                x: 24,
                y: 36,
                width: 96,
                height: 96,
                fit: 'stretch',
                texture: 'assets/icons/map.svg',
            },
        });
        expect(createSceneAssetNode(template, {
            kind: 'scene',
            path: 'src/scenes/Button.scene',
        }, { x: 40, y: 52 })).toEqual({
            kind: 'sceneInstance',
            type: 'Button',
            id: 'button2',
            scene: 'src/scenes/Button.scene',
            props: { x: 40, y: 52 },
            events: {},
            slots: {},
        });
    });

    it('starts asset drags for indexed images and other Scenes only', async () => {
        const wrapper = mount(AssetsPanel, {
            props: {
                currentScene: 'src/scenes/Menu.scene',
                expandedDirectories: ['assets', 'assets/icons', 'src', 'src/scenes'],
                project: {
                    name: 'demo',
                    root: '/demo',
                    scenes: ['src/scenes/Menu.scene', 'src/scenes/Button.scene'],
                    images: ['assets/icons/map.svg'],
                    files: [
                        { kind: 'scene', path: 'src/scenes/Menu.scene' },
                        { kind: 'image', path: 'assets/icons/map.svg' },
                        { kind: 'file', path: 'data/config.json' },
                        { kind: 'scene', path: 'src/scenes/Button.scene' },
                        { kind: 'script', path: 'src/scenes/Menu.ts' },
                    ],
                },
            },
        });
        const currentScene = wrapper.get('[data-asset-path="src/scenes/Menu.scene"]');
        const buttonScene = wrapper.get('[data-asset-path="src/scenes/Button.scene"]');
        const image = wrapper.get('[data-asset-path="assets/icons/map.svg"]');

        expect(currentScene.attributes('data-asset-draggable')).toBe('false');
        expect(buttonScene.attributes('data-asset-draggable')).toBe('true');
        expect(image.attributes('data-asset-draggable')).toBe('true');

        const selectionEvent = new Event('selectstart', { bubbles: true, cancelable: true });
        buttonScene.get('span').element.dispatchEvent(selectionEvent);
        expect(selectionEvent.defaultPrevented).toBe(true);

        await buttonScene.trigger('pointerdown', { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
        window.dispatchEvent(new PointerEvent('pointermove', { clientX: 15, clientY: 10, pointerId: 1 }));
        await image.trigger('pointerdown', { button: 0, clientX: 10, clientY: 10, pointerId: 2 });
        window.dispatchEvent(new PointerEvent('pointermove', { clientX: 15, clientY: 10, pointerId: 2 }));

        expect(wrapper.emitted('assetDragStart')).toEqual([
            [{ kind: 'scene', path: 'src/scenes/Button.scene' }],
            [{ kind: 'image', path: 'assets/icons/map.svg' }],
        ]);
    });

    it('restores and writes asset tree expansion through the Editor service', async () => {
        const project = {
            name: 'demo',
            root: '/demo',
            scenes: ['src/scenes/Menu.scene'],
            images: ['assets/icons/map.svg'],
            files: [
                { kind: 'image', path: 'assets/icons/map.svg' },
                { kind: 'scene', path: 'src/scenes/Menu.scene' },
                { kind: 'script', path: 'src/scenes/Menu.ts' },
            ],
        };
        let assetTreeExpandedDirectories = ['assets', 'assets/icons'];
        const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
            if (url === '/api/project') return Response.json(project);
            if (url === '/api/editor-ui-state') {
                if (init?.method === 'PUT') {
                    assetTreeExpandedDirectories = (
                        JSON.parse(String(init.body)) as { assetTreeExpandedDirectories: string[] }
                    ).assetTreeExpandedDirectories;
                }
                return Response.json({ assetTreeExpandedDirectories });
            }
            if (url === '/api/scene-bindings') return Response.json({});
            if (url.startsWith('/api/scene?')) {
                return Response.json({
                    path: 'src/scenes/Menu.scene',
                    source,
                    version: 'sha256:before',
                });
            }
            throw new Error('Unexpected Editor request: ' + url);
        });
        vi.stubGlobal('fetch', fetcher);
        vi.stubGlobal('WebSocket', AcceptedEditorWebSocket);
        const pinia = createPinia();
        setActivePinia(pinia);
        const wrapper = mount(EditorApp, {
            global: {
                plugins: [pinia],
                stubs: { SceneCanvas: true },
            },
        });

        await vi.waitFor(() => expect(useEditorUiStore().currentScenePath).toBe('src/scenes/Menu.scene'));
        useEditorUiStore().activeLeftTab = 'assets';
        await vi.waitFor(() => expect(wrapper.find('[data-asset-path="assets/icons/map.svg"]').exists()).toBe(true));
        expect(wrapper.get('[data-asset-directory="src"]').attributes('aria-expanded')).toBe('false');
        await wrapper.get('[data-asset-directory="assets"]').trigger('click');
        await vi.waitFor(() => expect(assetTreeExpandedDirectories).toEqual(['assets/icons']));
        expect(fetcher.mock.calls.some(([input, init]) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
            return url === '/api/editor-ui-state' && init?.method === 'PUT';
        })).toBe(true);
        wrapper.unmount();
    });

    it('locates an Inspector image reference in the asset tree', async () => {
        const imageSource = [
            '<Scene name="Menu">',
            '  <Image id="icon" texture="assets/icons/map.svg" />',
            '</Scene>',
            '',
        ].join('\n');
        const project = {
            name: 'demo',
            root: '/demo',
            scenes: ['src/scenes/Menu.scene'],
            images: ['assets/icons/map.svg'],
            files: [
                { kind: 'image', path: 'assets/icons/map.svg' },
                { kind: 'scene', path: 'src/scenes/Menu.scene' },
            ],
        };
        const fetcher = vi.fn(async (input: string | URL | Request) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
            if (url === '/api/project') return Response.json(project);
            if (url === '/api/editor-ui-state') return Response.json({});
            if (url === '/api/scene-bindings') return Response.json({});
            if (url.startsWith('/api/scene?')) {
                return Response.json({
                    path: 'src/scenes/Menu.scene',
                    source: imageSource,
                    version: 'sha256:before',
                });
            }
            throw new Error('Unexpected Editor request: ' + url);
        });
        vi.stubGlobal('fetch', fetcher);
        vi.stubGlobal('WebSocket', AcceptedEditorWebSocket);
        const pinia = createPinia();
        setActivePinia(pinia);
        const wrapper = mount(EditorApp, {
            global: {
                plugins: [pinia],
                stubs: { SceneCanvas: true },
            },
        });

        await vi.waitFor(() => expect(useEditorUiStore().currentScenePath).toBe('src/scenes/Menu.scene'));
        useEditorUiStore().selectedLocator = '0:icon';
        await flushPromises();
        await wrapper.get('input[data-prop="texture"]').trigger('click');
        await vi.waitFor(() => expect(useEditorUiStore().activeLeftTab).toBe('assets'));
        await vi.waitFor(() => expect(wrapper.get('[data-asset-path="assets/icons/map.svg"]').classes())
            .toContain('focused'));
        wrapper.unmount();
    });

    it('starts the asset tree folded except for the current Scene path and persists user changes', async () => {
        const wrapper = mount(AssetsPanel, {
            props: {
                currentScene: 'src/scenes/Menu.scene',
                project: {
                    name: 'demo',
                    root: '/demo',
                    scenes: ['src/scenes/Menu.scene', 'src/scenes/Button.scene'],
                    images: ['assets/icons/map.svg'],
                    files: [
                        { kind: 'image', path: 'assets/icons/map.svg' },
                        { kind: 'file', path: 'data/config.json' },
                        { kind: 'scene', path: 'src/scenes/Button.scene' },
                        { kind: 'scene', path: 'src/scenes/Menu.scene' },
                        { kind: 'script', path: 'src/scenes/Menu.ts' },
                    ],
                },
            },
        });

        expect(wrapper.find('[data-asset-directory="assets"]').exists()).toBe(true);
        expect(wrapper.find('[data-asset-directory="src"]').exists()).toBe(true);
        expect(wrapper.find('[data-asset-directory="src/scenes"]').exists()).toBe(true);
        expect(wrapper.find('[data-asset-directory="assets/icons"]').exists()).toBe(false);
        expect(wrapper.find('[data-asset-path="data/config.json"]').exists()).toBe(false);
        expect(wrapper.find('[data-asset-path="src/scenes/Menu.ts"]').exists()).toBe(false);
        expect(wrapper.text()).not.toContain('SCENES');
        expect(wrapper.text()).not.toContain('IMAGES');
        expect(wrapper.findAll('.asset-row').map((row) => (
            row.attributes('data-asset-directory') ?? row.attributes('data-asset-path')
        ))).toEqual([
            'assets',
            'src',
            'src/scenes',
            'src/scenes/Button.scene',
            'src/scenes/Menu.scene',
        ]);

        const currentScene = wrapper.get('[data-asset-path="src/scenes/Menu.scene"]');
        const buttonScene = wrapper.get('[data-asset-path="src/scenes/Button.scene"]');
        expect(currentScene.classes()).toContain('selected');
        expect(currentScene.attributes('title')).toBe('src/scenes/Menu.scene');
        await buttonScene.trigger('dblclick');
        expect(wrapper.emitted('openScene')).toEqual([['src/scenes/Button.scene']]);

        const assets = wrapper.get('[data-asset-directory="assets"]');
        expect(assets.attributes('aria-expanded')).toBe('false');
        await assets.trigger('click');
        expect(assets.attributes('aria-expanded')).toBe('true');
        expect(wrapper.find('[data-asset-path="assets/icons/map.svg"]').exists()).toBe(false);
        const icons = wrapper.get('[data-asset-directory="assets/icons"]');
        expect(icons.attributes('aria-expanded')).toBe('false');
        await icons.trigger('click');
        const image = wrapper.get('[data-asset-path="assets/icons/map.svg"]');
        const thumbnail = image.get('img.asset-thumbnail');
        expect(image.attributes('title')).toBe('assets/icons/map.svg');
        expect(thumbnail.attributes()).toMatchObject({
            alt: '',
            draggable: 'false',
            src: '/api/file?path=assets%2Ficons%2Fmap.svg&generation=0',
        });
        expect(wrapper.emitted('assetTreeExpansionChange')).toEqual([
            [['assets', 'src', 'src/scenes']],
            [['assets', 'assets/icons', 'src', 'src/scenes']],
        ]);
        const currentProject = wrapper.props().project!;
        await wrapper.setProps({
            project: {
                ...currentProject,
                files: [...currentProject.files],
            },
        });
        expect(wrapper.get('img.asset-thumbnail').attributes('src'))
            .toBe('/api/file?path=assets%2Ficons%2Fmap.svg&generation=1');
    });

    it('restores an explicitly saved asset tree expansion set', () => {
        const wrapper = mount(AssetsPanel, {
            props: {
                currentScene: 'src/scenes/Menu.scene',
                expandedDirectories: ['assets', 'assets/icons'],
                project: {
                    name: 'demo',
                    root: '/demo',
                    scenes: ['src/scenes/Menu.scene'],
                    images: ['assets/icons/map.svg'],
                    files: [
                        { kind: 'image', path: 'assets/icons/map.svg' },
                        { kind: 'scene', path: 'src/scenes/Menu.scene' },
                    ],
                },
            },
        });

        expect(wrapper.get('[data-asset-directory="assets"]').attributes('aria-expanded')).toBe('true');
        expect(wrapper.get('[data-asset-directory="assets/icons"]').attributes('aria-expanded')).toBe('true');
        expect(wrapper.find('[data-asset-path="assets/icons/map.svg"]').exists()).toBe(true);
        expect(wrapper.get('[data-asset-directory="src"]').attributes('aria-expanded')).toBe('false');
        expect(wrapper.find('[data-asset-path="src/scenes/Menu.scene"]').exists()).toBe(false);
    });

    it('locates an asset by expanding its directories and focusing its row', async () => {
        const wrapper = mount(AssetsPanel, {
            props: {
                focusAsset: { generation: 1, path: 'assets/icons/map.svg' },
                project: {
                    name: 'demo',
                    root: '/demo',
                    scenes: [],
                    images: ['assets/icons/map.svg'],
                    files: [{ kind: 'image', path: 'assets/icons/map.svg' }],
                },
            },
        });

        await flushPromises();

        expect(wrapper.get('[data-asset-directory="assets"]').attributes('aria-expanded')).toBe('true');
        expect(wrapper.get('[data-asset-directory="assets/icons"]').attributes('aria-expanded')).toBe('true');
        expect(wrapper.get('[data-asset-path="assets/icons/map.svg"]').classes()).toContain('focused');
        expect(wrapper.emitted('assetTreeExpansionChange')).toEqual([[['assets', 'assets/icons']]]);
        wrapper.unmount();
    });

    it('assigns unique ids throughout a duplicated subtree', () => {
        const template = parseSceneTemplate([
            '<Scene name="Menu">',
            '  <Group id="panel"><Text id="title" /></Group>',
            '</Scene>',
        ].join('\n'));

        const copy = duplicateSceneNode(template, template.children[0]);

        expect(copy).toMatchObject({
            id: 'panel2',
            children: [{ id: 'title2' }],
        });
    });

    it('keeps only UI state in Pinia', () => {
        setActivePinia(createPinia());

        const state = useEditorUiStore().$state;

        expect(Object.keys(state).sort()).toEqual([
            'activeLeftTab',
            'currentScenePath',
            'selectedLocator',
            'syncState',
        ]);
        expect(state).not.toHaveProperty('source');
        expect(state).not.toHaveProperty('template');
    });

    it('previews Inspector input and commits it on blur', async () => {
        const api = createApi();
        const document = markRaw(await SceneDocument.open('src/scenes/Menu.scene', api));
        const events: unknown[] = [];
        const revision = ref(0);
        document.subscribe((event) => {
            events.push(event);
            if (event.type === 'commandApplied') {
                revision.value += 1;
            }
        });
        const wrapper = mount(defineComponent({
            setup() {
                return () => h(InspectorPanel, {
                    document,
                    revision: revision.value,
                    selected: '0:title',
                });
            },
        }));
        const input = wrapper.get('input[data-prop="x"]');

        (input.element as HTMLInputElement).value = '48';
        await input.trigger('input');

        expect(events).toContainEqual({
            type: 'nodePropPreview',
            locator: '0:title',
            prop: 'x',
            value: 48,
        });
        expect(api.writeScene).not.toHaveBeenCalled();

        await input.trigger('blur');
        await flushPromises();

        expect(api.writeScene).toHaveBeenCalledTimes(1);
        expect(api.writeScene.mock.calls[0]?.[1]).toContain('x="48"');
        expect((wrapper.get('input[data-prop="x"]').element as HTMLInputElement).value).toBe('48');
        wrapper.unmount();
    });

    it('edits a node id in the Inspector and follows the relocated selection', async () => {
        const api = createApi();
        const document = markRaw(await SceneDocument.open('src/scenes/Menu.scene', api));
        const revision = ref(0);
        const selected = ref('0:title');
        document.subscribe((event) => {
            if (event.type === 'commandApplied') {
                revision.value += 1;
                if (event.selection?.type === 'node') {
                    selected.value = event.selection.node;
                }
            }
        });
        const wrapper = mount(defineComponent({
            setup() {
                return () => h(InspectorPanel, {
                    document,
                    revision: revision.value,
                    selected: selected.value,
                });
            },
        }));
        const input = wrapper.get('input[data-node-id]');

        expect((input.element as HTMLInputElement).value).toBe('title');
        (input.element as HTMLInputElement).value = 'headline';
        await input.trigger('input');
        await input.trigger('blur');
        await flushPromises();

        expect(document.source).toContain('<Text id="headline"');
        expect(selected.value).toBe('0:headline');
        expect((wrapper.get('input[data-node-id]').element as HTMLInputElement).value).toBe('headline');
        expect(api.writeScene).toHaveBeenCalledTimes(1);
        wrapper.unmount();
    });

    it('keeps invalid node id edits visible and restores the previous id', async () => {
        const api = createApi();
        api.readScene.mockResolvedValueOnce({
            path: 'src/scenes/Menu.scene',
            source: [
                '<Scene name="Menu">',
                '  <Text id="title" text="开始" />',
                '  <Text id="footer" text="结束" />',
                '</Scene>',
                '',
            ].join('\n'),
            version: 'sha256:before',
        });
        const document = markRaw(await SceneDocument.open('src/scenes/Menu.scene', api));
        const wrapper = mount(InspectorPanel, {
            props: {
                document,
                revision: 0,
                selected: '0:title',
            },
        });
        const input = wrapper.get('input[data-node-id]');

        (input.element as HTMLInputElement).value = '';
        await input.trigger('input');
        await input.trigger('blur');
        expect((wrapper.get('input[data-node-id]').element as HTMLInputElement).value).toBe('title');
        expect(wrapper.get('input[data-node-id]').classes()).toContain('is-invalid');
        expect(wrapper.text()).toContain('节点 ID 不能为空。');

        (input.element as HTMLInputElement).value = 'headline';
        await input.trigger('input');
        expect(wrapper.get('input[data-node-id]').classes()).not.toContain('is-invalid');
        expect(wrapper.get('input[data-node-id]').attributes('aria-invalid')).toBeUndefined();

        (input.element as HTMLInputElement).value = 'footer';
        await input.trigger('input');
        await input.trigger('blur');
        await flushPromises();
        expect((wrapper.get('input[data-node-id]').element as HTMLInputElement).value).toBe('title');
        expect(wrapper.get('input[data-node-id]').classes()).toContain('is-invalid');
        expect(wrapper.text()).toContain('Scene node id "footer" is already in use.');
        expect(api.writeScene).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it('keeps color input as hex through change and blur with one commit', async () => {
        const api = createApi();
        api.readScene.mockResolvedValueOnce({
            path: 'src/scenes/Menu.scene',
            source: [
                '<Scene name="Menu">',
                '  <Rect id="panel" fillColor="#09101b" />',
                '</Scene>',
                '',
            ].join('\n'),
            version: 'sha256:before',
        });
        const document = markRaw(await SceneDocument.open('src/scenes/Menu.scene', api));
        const events: unknown[] = [];
        const revision = ref(0);
        document.subscribe((event) => {
            events.push(event);
            if (event.type === 'commandApplied') {
                revision.value += 1;
            }
        });
        const wrapper = mount(defineComponent({
            setup() {
                return () => h(InspectorPanel, {
                    document,
                    revision: revision.value,
                    selected: '0:panel',
                });
            },
        }));
        const input = wrapper.get('input[data-prop="fillColor"]');

        expect((input.element as HTMLInputElement).value).toBe('#09101b');
        (input.element as HTMLInputElement).value = '#123456';
        await input.trigger('input');

        expect(events).toContainEqual({
            type: 'nodePropPreview',
            locator: '0:panel',
            prop: 'fillColor',
            value: 0x123456,
        });

        await input.trigger('change');
        await input.trigger('blur');
        await flushPromises();

        expect(api.writeScene).toHaveBeenCalledTimes(1);
        expect(document.source).toContain('fillColor="#123456"');
        expect((wrapper.get('input[data-prop="fillColor"]').element as HTMLInputElement).value).toBe('#123456');
        expect(events.filter((event) => (
            typeof event === 'object'
            && event !== null
            && 'type' in event
            && event.type === 'commandApplied'
        ))).toHaveLength(1);

        await document.undo();
        await flushPromises();
        expect(document.source).toContain('fillColor="#09101b"');
        wrapper.unmount();
    });

    it('shows optional frame layout fields and commits a new constraint', async () => {
        const api = createApi();
        api.readScene.mockResolvedValueOnce({
            path: 'src/scenes/Menu.scene',
            source: [
                '<Scene name="Menu">',
                '  <Rect id="panel" left="20" top="10" />',
                '</Scene>',
                '',
            ].join('\n'),
            version: 'sha256:before',
        });
        const document = markRaw(await SceneDocument.open('src/scenes/Menu.scene', api));
        const events: unknown[] = [];
        document.subscribe((event) => events.push(event));
        const wrapper = mount(InspectorPanel, {
            props: {
                document,
                revision: 0,
                selected: '0:panel',
            },
        });

        expect((wrapper.get('input[data-prop="left"]').element as HTMLInputElement).value).toBe('20');
        expect((wrapper.get('input[data-prop="right"]').element as HTMLInputElement).value).toBe('');
        expect((wrapper.get('input[data-prop="top"]').element as HTMLInputElement).value).toBe('10');
        expect((wrapper.get('input[data-prop="bottom"]').element as HTMLInputElement).value).toBe('');
        expect((wrapper.get('input[data-prop="horizontal"]').element as HTMLInputElement).value).toBe('');
        expect((wrapper.get('input[data-prop="vertical"]').element as HTMLInputElement).value).toBe('');

        const right = wrapper.get('input[data-prop="right"]');
        (right.element as HTMLInputElement).value = '30';
        await right.trigger('input');

        expect(events).toContainEqual({
            type: 'nodePropPreview',
            locator: '0:panel',
            prop: 'right',
            value: 30,
        });

        await right.trigger('blur');
        await flushPromises();

        expect(api.writeScene).toHaveBeenCalledTimes(1);
        expect(api.writeScene.mock.calls[0]?.[1]).toContain('right="30"');
        wrapper.unmount();
    });

    it('makes transform fields read-only when frame layout controls their result', async () => {
        const api = createApi();
        api.readScene.mockResolvedValueOnce({
            path: 'src/scenes/Battle.scene',
            source: [
                '<Scene name="Battle">',
                '  <Group id="battleArea" x="0" y="80" width="720" height="1100" left="0" right="0" top="0" bottom="0" />',
                '  <Group id="enemyArea" x="0" y="0" width="720" height="600" horizontal="0" vertical="-232.11" />',
                '  <Group id="playerArea" x="0" y="600" width="720" height="500" bottom="0" />',
                '</Scene>',
                '',
            ].join('\n'),
            version: 'sha256:before',
        });
        const document = markRaw(await SceneDocument.open('src/scenes/Battle.scene', api));
        const wrapper = mount(InspectorPanel, {
            props: {
                document,
                revision: 0,
                selected: '0:battleArea',
            },
        });

        for (const prop of ['x', 'y', 'width', 'height']) {
            expect(wrapper.get(`[data-prop="${prop}"]`).attributes('disabled')).toBeDefined();
        }
        expect(wrapper.get('[data-prop="left"]').attributes('disabled')).toBeUndefined();
        expect(wrapper.get('[data-prop="x"]').attributes('title')).toContain('布局');

        await wrapper.setProps({ selected: '1:enemyArea' });
        await flushPromises();
        expect(wrapper.get('input[data-prop="x"]').attributes('disabled')).toBeDefined();
        expect(wrapper.get('input[data-prop="y"]').attributes('disabled')).toBeDefined();
        expect(wrapper.get('input[data-prop="width"]').attributes('disabled')).toBeUndefined();
        expect(wrapper.get('input[data-prop="height"]').attributes('disabled')).toBeUndefined();

        await wrapper.setProps({ selected: '2:playerArea' });
        await flushPromises();
        expect(wrapper.get('input[data-prop="y"]').attributes('disabled')).toBeDefined();
        expect(wrapper.get('input[data-prop="x"]').attributes('disabled')).toBeUndefined();
        wrapper.unmount();
    });

    it('groups related Inspector fields into semantic sections and paired rows', async () => {
        const api = createApi();
        api.readScene.mockResolvedValueOnce({
            path: 'src/scenes/Menu.scene',
            source: [
                '<Scene name="Menu">',
                '  <NineImage id="panel" texture="assets/panel.png" anchorX="0.5" anchorY="0.5" />',
                '</Scene>',
                '',
            ].join('\n'),
            version: 'sha256:before',
        });
        const document = markRaw(await SceneDocument.open('src/scenes/Menu.scene', api));
        const wrapper = mount(InspectorPanel, {
            props: {
                document,
                revision: 0,
                selected: '0:panel',
            },
        });

        expect(wrapper.findAll('[data-inspector-section]').map((section) => ({
            key: section.attributes('data-inspector-section'),
            title: section.get('.inspector-section-title').text(),
        }))).toEqual([
            { key: 'identity', title: '节点' },
            { key: 'transform', title: '变换' },
            { key: 'layout', title: '布局' },
            { key: 'display', title: '显示与交互' },
            { key: 'node', title: '节点属性' },
        ]);

        const rowProps = (key: string) => wrapper.get(`[data-field-row="${key}"]`)
            .findAll('[data-prop]')
            .map((control) => control.attributes('data-prop'));

        expect(rowProps('x:y')).toEqual(['x', 'y']);
        expect(rowProps('width:height')).toEqual(['width', 'height']);
        expect(rowProps('left:right')).toEqual(['left', 'right']);
        expect(rowProps('top:bottom')).toEqual(['top', 'bottom']);
        expect(rowProps('rotation')).toEqual(['rotation']);
        expect(rowProps('leftWidth')).toEqual(['leftWidth']);
        expect(rowProps('rightWidth')).toEqual(['rightWidth']);
        expect(rowProps('topHeight')).toEqual(['topHeight']);
        expect(rowProps('bottomHeight')).toEqual(['bottomHeight']);
        expect(rowProps('anchorX:anchorY')).toEqual(['anchorX', 'anchorY']);
        wrapper.unmount();
    });

    it('emits an asset location request when an Inspector image path is clicked', async () => {
        const api = createApi();
        api.readScene.mockResolvedValueOnce({
            path: 'src/scenes/Menu.scene',
            source: [
                '<Scene name="Menu">',
                '  <Image id="icon" texture="assets/icons/map.svg" />',
                '</Scene>',
                '',
            ].join('\n'),
            version: 'sha256:before',
        });
        const document = markRaw(await SceneDocument.open('src/scenes/Menu.scene', api));
        const wrapper = mount(InspectorPanel, {
            props: {
                document,
                revision: 0,
                selected: '0:icon',
            },
        });

        await wrapper.get('input[data-prop="texture"]').trigger('click');

        expect(wrapper.emitted('locateAsset')).toEqual([['assets/icons/map.svg']]);
        wrapper.unmount();
    });

    it('sets an empty Inspector image resource field with one undoable drop', async () => {
        const api = createApi();
        api.readScene.mockResolvedValueOnce({
            path: 'src/scenes/Menu.scene',
            source: [
                '<Scene name="Menu">',
                '  <Image id="icon" />',
                '</Scene>',
                '',
            ].join('\n'),
            version: 'sha256:before',
        });
        const document = markRaw(await SceneDocument.open('src/scenes/Menu.scene', api));
        const wrapper = mount(InspectorPanel, {
            props: {
                document,
                draggedAsset: { kind: 'image', path: 'assets/icons/bag.svg' },
                revision: 0,
                selected: '0:icon',
            },
        });
        const target = wrapper.get('[data-asset-drop-prop="texture"]');

        expect(target.classes()).toContain('is-image-drop-candidate');
        await target.trigger('pointerup');
        await flushPromises();

        expect(api.writeScene).toHaveBeenCalledTimes(1);
        expect(document.source).toContain('texture="assets/icons/bag.svg"');
        expect(wrapper.emitted('assetDrop')).toEqual([[]]);

        await document.undo();
        await flushPromises();

        expect(api.writeScene).toHaveBeenCalledTimes(2);
        expect(document.source).not.toContain('texture=');
        wrapper.unmount();
    });

    it('replaces an Inspector image resource field and Undo restores its previous path', async () => {
        const api = createApi();
        api.readScene.mockResolvedValueOnce({
            path: 'src/scenes/Menu.scene',
            source: [
                '<Scene name="Menu">',
                '  <Image id="icon" texture="assets/icons/map.svg" />',
                '</Scene>',
                '',
            ].join('\n'),
            version: 'sha256:before',
        });
        const document = markRaw(await SceneDocument.open('src/scenes/Menu.scene', api));
        const wrapper = mount(InspectorPanel, {
            props: {
                document,
                draggedAsset: { kind: 'image', path: 'assets/icons/bag.svg' },
                revision: 0,
                selected: '0:icon',
            },
        });

        await wrapper.get('[data-asset-drop-prop="texture"]').trigger('pointerup');
        await flushPromises();

        expect(api.writeScene).toHaveBeenCalledTimes(1);
        expect(document.source).toContain('texture="assets/icons/bag.svg"');
        expect(document.source).not.toContain('texture="assets/icons/map.svg"');

        await document.undo();
        await flushPromises();

        expect(document.source).toContain('texture="assets/icons/map.svg"');
        wrapper.unmount();
    });

    it('rejects image drops on ordinary strings and bindings, and rejects Scene assets', async () => {
        const api = createApi();
        api.readScene.mockResolvedValueOnce({
            path: 'src/scenes/Menu.scene',
            source: [
                '<Scene name="Menu">',
                '  <Text id="title" text="开始" />',
                '  <Image id="icon" />',
                '  <Image id="boundIcon" texture="{iconTexture}" />',
                '</Scene>',
                '',
            ].join('\n'),
            version: 'sha256:before',
        });
        const document = markRaw(await SceneDocument.open('src/scenes/Menu.scene', api));
        const selected = ref('0:title');
        const draggedAsset = ref<{ kind: 'image' | 'scene'; path: string }>({
            kind: 'image',
            path: 'assets/icons/bag.svg',
        });
        const wrapper = mount(defineComponent({
            setup() {
                return () => h(InspectorPanel, {
                    document,
                    draggedAsset: draggedAsset.value,
                    revision: 0,
                    sceneInterfaces: {
                        'src/scenes/Menu.scene': {
                            props: {
                                iconTexture: { type: 'string', default: 'assets/icons/map.svg' },
                            },
                            events: {},
                            slots: {},
                        },
                    },
                    selected: selected.value,
                });
            },
        }));

        expect(wrapper.find('[data-asset-drop-prop]').exists()).toBe(false);
        await wrapper.get('input[data-prop="text"]').trigger('pointerup');

        selected.value = '1:icon';
        draggedAsset.value = { kind: 'scene', path: 'src/scenes/Button.scene' };
        await flushPromises();

        const texture = wrapper.get('[data-asset-drop-prop="texture"]');
        expect(texture.classes()).not.toContain('is-image-drop-candidate');
        await texture.trigger('pointerup');

        selected.value = '2:boundIcon';
        draggedAsset.value = { kind: 'image', path: 'assets/icons/bag.svg' };
        await flushPromises();

        const boundTexture = wrapper.get('[data-asset-drop-prop="texture"]');
        expect(boundTexture.classes()).not.toContain('is-image-drop-candidate');
        expect((boundTexture.get('input').element as HTMLInputElement).disabled).toBe(true);
        await boundTexture.trigger('pointerup');
        await flushPromises();

        expect(api.writeScene).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it('shows Label box and typography fields in the Inspector', async () => {
        const api = createApi();
        api.readScene.mockResolvedValueOnce({
            path: 'src/scenes/Menu.scene',
            source: [
                '<Scene name="Menu">',
                '  <Label id="title" text="开始" />',
                '</Scene>',
                '',
            ].join('\n'),
            version: 'sha256:before',
        });
        const document = markRaw(await SceneDocument.open('src/scenes/Menu.scene', api));
        const wrapper = mount(InspectorPanel, {
            props: {
                document,
                revision: 0,
                selected: '0:title',
            },
        });

        expect((wrapper.get('input[data-prop="width"]').element as HTMLInputElement).value).toBe('120');
        expect((wrapper.get('input[data-prop="height"]').element as HTMLInputElement).value).toBe('28');
        expect((wrapper.get('input[data-prop="fontSize"]').element as HTMLInputElement).value).toBe('16');
        expect((wrapper.get('input[data-prop="wordWrap"]').element as HTMLInputElement).checked).toBe(false);
        expect(wrapper.get('select[data-prop="fontWeight"]').findAll('option').map((option) => option.text()))
            .toEqual(['400', '500', '600', '700', 'bold']);
        expect((wrapper.get('select[data-prop="alignX"]').element as HTMLSelectElement).value).toBe('start');
        expect((wrapper.get('select[data-prop="alignY"]').element as HTMLSelectElement).value).toBe('start');
        expect((wrapper.get('select[data-prop="overflow"]').element as HTMLSelectElement).value).toBe('visible');
        wrapper.unmount();
    });

    it('shows BitmapLabel box and typography fields in the Inspector', async () => {
        const api = createApi();
        api.readScene.mockResolvedValueOnce({
            path: 'src/scenes/Menu.scene',
            source: [
                '<Scene name="Menu">',
                '  <BitmapLabel id="gold" text="1280" fontFamily="AntCount" />',
                '</Scene>',
                '',
            ].join('\n'),
            version: 'sha256:before',
        });
        const document = markRaw(await SceneDocument.open('src/scenes/Menu.scene', api));
        const wrapper = mount(InspectorPanel, {
            props: {
                document,
                revision: 0,
                selected: '0:gold',
            },
        });

        expect((wrapper.get('input[data-prop="width"]').element as HTMLInputElement).value).toBe('120');
        expect((wrapper.get('input[data-prop="height"]').element as HTMLInputElement).value).toBe('28');
        expect((wrapper.get('input[data-prop="fontFamily"]').element as HTMLInputElement).value).toBe('AntCount');
        expect((wrapper.get('input[data-prop="fontSize"]').element as HTMLInputElement).value).toBe('16');
        expect((wrapper.get('input[data-prop="wordWrap"]').element as HTMLInputElement).checked).toBe(false);
        expect((wrapper.get('select[data-prop="alignX"]').element as HTMLSelectElement).value).toBe('start');
        expect((wrapper.get('select[data-prop="alignY"]').element as HTMLSelectElement).value).toBe('start');
        expect((wrapper.get('select[data-prop="overflow"]').element as HTMLSelectElement).value).toBe('visible');
        wrapper.unmount();
    });

    it('does not replace newer input when an earlier save finishes', async () => {
        const api = createApi();
        let finishWrite!: (value: { path: string; version: string }) => void;
        api.writeScene.mockImplementationOnce(() => new Promise((resolve) => {
            finishWrite = resolve;
        }));
        const document = markRaw(await SceneDocument.open('src/scenes/Menu.scene', api));
        const revision = ref(0);
        document.subscribe((event) => {
            if (event.type === 'commandApplied') {
                revision.value += 1;
            }
        });
        const wrapper = mount(defineComponent({
            setup() {
                return () => h(InspectorPanel, {
                    document,
                    revision: revision.value,
                    selected: '0:title',
                });
            },
        }));
        const input = wrapper.get('input[data-prop="x"]');
        (input.element as HTMLInputElement).value = '48';
        await input.trigger('input');
        await input.trigger('blur');
        await vi.waitFor(() => expect(api.writeScene).toHaveBeenCalledTimes(1));

        const latestInput = wrapper.get('input[data-prop="x"]');
        (latestInput.element as HTMLInputElement).value = '56';
        await latestInput.trigger('input');
        finishWrite({ path: 'src/scenes/Menu.scene', version: 'sha256:after' });
        await flushPromises();

        expect((wrapper.get('input[data-prop="x"]').element as HTMLInputElement).value).toBe('56');
        wrapper.unmount();
    });

    it('edits primitive and Variant Props declared by a Scene Instance contract', async () => {
        const api = createApi();
        api.readScene.mockResolvedValueOnce({
            path: 'src/scenes/Toolbar.scene',
            source: [
                '<Scene name="Toolbar">',
                '  <Button id="inventory" scene="./Button.scene" label="背包" tone="danger" />',
                '</Scene>',
                '',
            ].join('\n'),
            version: 'sha256:before',
        });
        const document = markRaw(await SceneDocument.open('src/scenes/Toolbar.scene', api));
        const events: unknown[] = [];
        document.subscribe((event) => events.push(event));
        const sceneInterfaces: Record<string, SceneTemplateInterface> = {
            'src/scenes/Button.scene': {
                props: {
                    label: { type: 'string', default: 'Button' },
                    tone: {
                        type: 'variant',
                        default: 'primary',
                        variants: {
                            primary: { background: '#24456f' },
                            danger: { background: '#713044' },
                        },
                    },
                },
                events: {},
                slots: {},
            },
        };
        const wrapper = mount(InspectorPanel, {
            props: {
                document,
                revision: 0,
                sceneInterfaces,
                selected: '0:inventory',
            },
        });

        const label = wrapper.get('input[data-prop="label"]');
        const tone = wrapper.get('select[data-prop="tone"]');
        expect(wrapper.get('[data-inspector-section="props"] .inspector-section-title').text()).toBe('Scene Props');
        expect(wrapper.get('[data-inspector-section="props"] input[data-prop="label"]').exists()).toBe(true);
        expect(wrapper.get('[data-inspector-section="props"] select[data-prop="tone"]').exists()).toBe(true);
        expect(wrapper.find('input[data-prop="left"]').exists()).toBe(true);
        expect(wrapper.find('input[data-prop="right"]').exists()).toBe(true);
        expect(wrapper.find('input[data-prop="top"]').exists()).toBe(true);
        expect(wrapper.find('input[data-prop="bottom"]').exists()).toBe(true);
        expect(wrapper.find('input[data-prop="horizontal"]').exists()).toBe(true);
        expect(wrapper.find('input[data-prop="vertical"]').exists()).toBe(true);
        expect((label.element as HTMLInputElement).value).toBe('背包');
        expect((tone.element as HTMLSelectElement).value).toBe('danger');
        expect(tone.findAll('option').map((option) => option.text())).toEqual(['primary', 'danger']);

        (label.element as HTMLInputElement).value = '仓库';
        await label.trigger('input');
        expect(events).toContainEqual({
            type: 'nodePropPreview',
            locator: '0:inventory',
            prop: 'label',
            value: '仓库',
        });
        wrapper.unmount();
    });

    it('shows resolved Binding targets as read-only and detaches them to literal values', async () => {
        const api = createApi();
        api.readScene.mockResolvedValueOnce({
            path: 'src/scenes/Button.scene',
            source: [
                '<Scene name="Button">',
                '  <Rect id="background" fillColor="{tone.background}" />',
                '  <Text id="labelText" text="{label}" />',
                '</Scene>',
                '',
            ].join('\n'),
            version: 'sha256:before',
        });
        const document = markRaw(await SceneDocument.open('src/scenes/Button.scene', api));
        const revision = ref(0);
        document.subscribe((event) => {
            if (event.type === 'commandApplied') {
                revision.value += 1;
            }
        });
        const sceneInterfaces: Record<string, SceneTemplateInterface> = {
            'src/scenes/Button.scene': {
                props: {
                    label: { type: 'string', default: 'Button' },
                    tone: {
                        type: 'variant',
                        default: 'primary',
                        variants: {
                            primary: { background: '#24456f' },
                            danger: { background: '#713044' },
                        },
                    },
                },
                events: {},
                slots: {},
            },
        };
        const selected = ref('1:labelText');
        const wrapper = mount(defineComponent({
            setup() {
                return () => h(InspectorPanel, {
                    document,
                    revision: revision.value,
                    sceneInterfaces,
                    selected: selected.value,
                });
            },
        }));

        const text = wrapper.get('input[data-prop="text"]');
        expect((text.element as HTMLInputElement).value).toBe('Button');
        expect((text.element as HTMLInputElement).disabled).toBe(true);
        expect(wrapper.get('[data-binding-source="text"]').text()).toBe('绑定：label');

        selected.value = '0:background';
        await flushPromises();

        const fillColor = wrapper.get('input[data-prop="fillColor"]');
        expect((fillColor.element as HTMLInputElement).value).toBe('#24456f');
        expect((fillColor.element as HTMLInputElement).disabled).toBe(true);
        expect(wrapper.get('[data-binding-source="fillColor"]').text()).toBe('绑定：tone.background');

        await wrapper.get('button[data-unbind-prop="fillColor"]').trigger('click');
        await flushPromises();

        expect(api.writeScene).toHaveBeenCalledTimes(1);
        expect(api.writeScene.mock.calls[0]?.[1]).toContain('fillColor="#24456f"');
        expect(document.source).not.toContain('fillColor="{tone.background}"');
        expect(wrapper.find('[data-binding-source="fillColor"]').exists()).toBe(false);
        expect((wrapper.get('input[data-prop="fillColor"]').element as HTMLInputElement).disabled).toBe(false);

        await document.undo();
        await flushPromises();

        expect(document.source).toContain('fillColor="{tone.background}"');
        expect(api.writeScene).toHaveBeenCalledTimes(2);
        expect(wrapper.get('[data-binding-source="fillColor"]').text()).toBe('绑定：tone.background');
        expect((wrapper.get('input[data-prop="fillColor"]').element as HTMLInputElement).disabled).toBe(true);
        wrapper.unmount();
    });

    it('adds, duplicates, deletes, and reparents nodes from the hierarchy', async () => {
        const api = createApi();
        api.readScene.mockResolvedValueOnce({
            path: 'src/scenes/Menu.scene',
            source: [
                '<Scene name="Menu">',
                '  <Group id="panel" width="320" height="180">',
                '    <Text id="title" text="开始" />',
                '  </Group>',
                '  <Text id="footer" text="Footer" />',
                '</Scene>',
                '',
            ].join('\n'),
            version: 'sha256:before',
        });
        const document = markRaw(await SceneDocument.open('src/scenes/Menu.scene', api));
        const revision = ref(0);
        const selected = ref<string | undefined>('0:panel/0:title');
        document.subscribe((event) => {
            if (event.type !== 'commandApplied') return;
            revision.value += 1;
            selected.value = event.selection?.type === 'node' ? event.selection.node : undefined;
        });
        const wrapper = mount(defineComponent({
            setup() {
                return () => h(HierarchyPanel, {
                    document,
                    revision: revision.value,
                    selected: selected.value,
                });
            },
        }));

        expect(wrapper.find('[data-drag-handle]').exists()).toBe(false);

        await wrapper.get('select[aria-label="节点类型"]').setValue('Rect');
        await wrapper.get('button[aria-label="添加节点"]').trigger('click');
        await flushPromises();

        expect(document.source).toContain('<Rect id="rect"');
        expect(selected.value).toBe('0:panel/1:rect');

        await wrapper.get('button[aria-label="复制节点"]').trigger('click');
        await flushPromises();

        expect(document.source).toContain('<Rect id="rect2"');
        expect(selected.value).toBe('0:panel/2:rect2');

        await wrapper.get('button[aria-label="删除节点"]').trigger('click');
        await flushPromises();

        expect(document.source).not.toContain('id="rect2"');
        expect(selected.value).toBe('0:panel');

        const hierarchy = wrapper.get('.hierarchy-panel');
        expect(hierarchy.classes()).not.toContain('is-dragging');
        await wrapper.get('button[data-locator="1:footer"]').trigger('pointerdown');
        expect(hierarchy.classes()).toContain('is-dragging');
        const panelRow = wrapper.get('button[data-locator="0:panel"]');
        await panelRow.trigger('pointermove', { clientY: 13 });
        expect(panelRow.classes()).toContain('drop-inside');
        window.dispatchEvent(new Event('pointerup'));
        await flushPromises();

        expect(hierarchy.classes()).not.toContain('is-dragging');
        expect(document.source.indexOf('id="footer"')).toBeLessThan(document.source.indexOf('</Group>'));

        await wrapper.get('button[data-locator="0:panel/2:footer"]').trigger('pointerdown');
        const titleRow = wrapper.get('button[data-locator="0:panel/0:title"]');
        await titleRow.trigger('pointermove', { clientY: 1 });
        expect(titleRow.classes()).toContain('drop-before');
        window.dispatchEvent(new Event('pointerup'));
        await flushPromises();

        expect(document.source.indexOf('id="footer"')).toBeLessThan(document.source.indexOf('id="title"'));

        await wrapper.get('button[data-locator="0:panel"]').trigger('pointerdown');
        const rectRow = wrapper.get('button[data-locator="0:panel/2:rect"]');
        await rectRow.trigger('pointermove', { clientY: 1 });
        expect(rectRow.classes()).not.toContain('drop-before');
        window.dispatchEvent(new Event('pointerup'));
        await flushPromises();

        expect(api.writeScene).toHaveBeenCalledTimes(5);
        wrapper.unmount();
    });

    it('inserts a dragged asset at the hierarchy drop target', async () => {
        const api = createApi();
        api.readScene.mockResolvedValueOnce({
            path: 'src/scenes/Menu.scene',
            source: [
                '<Scene name="Menu">',
                '  <Group id="panel" width="320" height="180" />',
                '</Scene>',
                '',
            ].join('\n'),
            version: 'sha256:before',
        });
        const document = markRaw(await SceneDocument.open('src/scenes/Menu.scene', api));
        const wrapper = mount(HierarchyPanel, {
            props: {
                document,
                draggedAsset: { kind: 'image', path: 'assets/icons/map.svg' },
                revision: 0,
            },
        });
        const panelRow = wrapper.get('button[data-locator="0:panel"]');

        await panelRow.trigger('pointermove', { clientY: 13 });
        expect(panelRow.classes()).toContain('drop-inside');
        await panelRow.trigger('pointerup', { clientY: 13 });
        await flushPromises();

        expect(document.template.children[0]).toMatchObject({
            children: [{
                kind: 'pixi',
                type: 'Image',
                id: 'image',
                props: { texture: 'assets/icons/map.svg' },
            }],
        });
        expect(api.writeScene).toHaveBeenCalledTimes(1);
        wrapper.unmount();
    });
});
