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

    it('shows supported assets in a collapsible project-relative directory tree', async () => {
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
        expect(wrapper.find('[data-asset-directory="assets/icons"]').exists()).toBe(true);
        expect(wrapper.find('[data-asset-directory="src"]').exists()).toBe(true);
        expect(wrapper.find('[data-asset-directory="src/scenes"]').exists()).toBe(true);
        expect(wrapper.find('[data-asset-path="data/config.json"]').exists()).toBe(false);
        expect(wrapper.find('[data-asset-path="src/scenes/Menu.ts"]').exists()).toBe(false);
        expect(wrapper.text()).not.toContain('SCENES');
        expect(wrapper.text()).not.toContain('IMAGES');
        expect(wrapper.findAll('.asset-row').map((row) => (
            row.attributes('data-asset-directory') ?? row.attributes('data-asset-path')
        ))).toEqual([
            'assets',
            'assets/icons',
            'assets/icons/map.svg',
            'src',
            'src/scenes',
            'src/scenes/Button.scene',
            'src/scenes/Menu.scene',
        ]);

        const currentScene = wrapper.get('[data-asset-path="src/scenes/Menu.scene"]');
        const buttonScene = wrapper.get('[data-asset-path="src/scenes/Button.scene"]');
        const image = wrapper.get('[data-asset-path="assets/icons/map.svg"]');
        expect(currentScene.classes()).toContain('selected');
        expect(currentScene.attributes('title')).toBe('src/scenes/Menu.scene');
        expect(image.attributes('title')).toBe('assets/icons/map.svg');
        await buttonScene.trigger('dblclick');
        expect(wrapper.emitted('openScene')).toEqual([['src/scenes/Button.scene']]);

        const assets = wrapper.get('[data-asset-directory="assets"]');
        expect(assets.attributes('aria-expanded')).toBe('true');
        await assets.trigger('click');
        expect(assets.attributes('aria-expanded')).toBe('false');
        expect(wrapper.find('[data-asset-path="assets/icons/map.svg"]').exists()).toBe(false);
        await assets.trigger('click');
        expect(wrapper.find('[data-asset-path="assets/icons/map.svg"]').exists()).toBe(true);
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
