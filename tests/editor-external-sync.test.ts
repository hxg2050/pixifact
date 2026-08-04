import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h, onMounted, watch } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EditorApp from '../apps/editor/src/EditorApp.vue';
import { readEditorProjectFile } from '../apps/editor/src/services/editorApi';
import { useEditorUiStore } from '../apps/editor/src/stores/editorUi';
import { createEditorProjectService } from '../packages/pixifact-cli/src/editorServer';

const tempRoots: string[] = [];

function menuSource(label: string) {
    return [
        '<Scene name="Menu">',
        `  <ZButton id="button" scene="./ZButton.scene" label="${label}" />`,
        '  <Image id="icon" texture="assets/icon.svg" />',
        '</Scene>',
        '',
    ].join('\n');
}

function buttonScript(includeTone = false) {
    return [
        "import { Group } from 'pixifact/runtime';",
        "import { prop, scene } from 'pixifact/scene';",
        '',
        '@scene()',
        'export class ZButton extends Group {',
        "  @prop({ default: '按钮' })",
        '  declare label: string;',
        ...(includeTone ? [
            '',
            "  @prop({ default: 'primary' })",
            '  declare tone: string;',
        ] : []),
        '}',
        '',
    ].join('\n');
}

function createFixture() {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pixifact-editor-external-'));
    const staticRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pixifact-editor-static-'));
    tempRoots.push(projectRoot, staticRoot);
    fs.mkdirSync(path.join(projectRoot, 'src', 'scenes'), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'Menu.scene'), menuSource('初始'));
    fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'Menu.ts'), [
        "import { Group } from 'pixifact/runtime';",
        "import { scene } from 'pixifact/scene';",
        '',
        '@scene()',
        'export class Menu extends Group {}',
        '',
    ].join('\n'));
    fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'ZButton.scene'), [
        '<Scene name="ZButton">',
        '  <Text id="label" text="{label}" />',
        '</Scene>',
        '',
    ].join('\n'));
    fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'ZButton.ts'), buttonScript());
    fs.writeFileSync(path.join(projectRoot, 'assets', 'icon.svg'), '<svg><rect fill="#111111" /></svg>');
    fs.writeFileSync(path.join(staticRoot, 'index.html'), '<main>Editor</main>');
    return {
        projectRoot,
        service: createEditorProjectService({ projectRoot, staticRoot }),
    };
}

class EditorWebSocket {
    static readonly OPEN = 1;
    static instances: EditorWebSocket[] = [];
    readonly listeners = new Map<string, Array<(event: { data?: string }) => void>>();
    readonly sent: string[] = [];
    readyState = EditorWebSocket.OPEN;

    constructor(_url: string) {
        EditorWebSocket.instances.push(this);
        queueMicrotask(() => this.emit('message', JSON.stringify({
            type: 'editorSessionActive',
            protocolVersion: 2,
        })));
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

    change(path: string) {
        this.emit('message', JSON.stringify({ type: 'projectFileChanged', path }));
    }
}

function serviceFetcher(service: ReturnType<typeof createEditorProjectService>) {
    return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        if (input instanceof Request) return service.fetch(input);
        return service.fetch(new Request(new URL(String(input), 'http://localhost'), init));
    });
}

afterEach(() => {
    EditorWebSocket.instances = [];
    vi.unstubAllGlobals();
    for (const root of tempRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('Editor external project synchronization', () => {
    it('applies only the latest external Scene revision and establishes a new baseline', async () => {
        const fixture = createFixture();
        const fetcher = serviceFetcher(fixture.service);
        const heldSceneReads: Array<{ release: () => void }> = [];
        let heldReadsRemaining = 0;
        const delayedFetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
            const url = input instanceof Request ? input.url : String(input);
            const response = await fetcher(input, init);
            if (
                heldReadsRemaining > 0
                && !init?.method
                && url.includes('/api/scene?')
                && url.includes('Menu.scene')
            ) {
                heldReadsRemaining -= 1;
                return new Promise<Response>((resolve) => {
                    heldSceneReads.push({ release: () => resolve(response) });
                });
            }
            return response;
        });
        const canvasMounts = vi.fn();
        const SceneCanvasStub = defineComponent({
            setup() {
                onMounted(canvasMounts);
                return () => h('div', { 'data-testid': 'scene-canvas' });
            },
        });
        vi.stubGlobal('fetch', delayedFetcher);
        vi.stubGlobal('WebSocket', EditorWebSocket);
        const pinia = createPinia();
        setActivePinia(pinia);
        const wrapper = mount(EditorApp, {
            global: {
                plugins: [pinia],
                stubs: { SceneCanvas: SceneCanvasStub },
            },
        });

        await vi.waitFor(() => expect(wrapper.find('[data-locator="0:button"]').exists()).toBe(true));
        await wrapper.get('[data-locator="0:button"]').trigger('click');
        const ui = useEditorUiStore();
        const label = wrapper.get('input[data-prop="label"]');
        (label.element as HTMLInputElement).value = '本地';
        await label.trigger('input');
        await label.trigger('blur');
        await vi.waitFor(() => expect(wrapper.get('button[aria-label="撤销"]').attributes('disabled')).toBeUndefined());
        await vi.waitFor(() => expect(wrapper.get('button[aria-label="刷新"]').attributes('disabled')).toBeUndefined());

        heldReadsRemaining = 2;
        fs.writeFileSync(path.join(fixture.projectRoot, 'src', 'scenes', 'Menu.scene'), menuSource('中间'));
        EditorWebSocket.instances[0].change('src/scenes/Menu.scene');
        await vi.waitFor(() => expect(heldSceneReads).toHaveLength(1));

        fs.writeFileSync(path.join(fixture.projectRoot, 'src', 'scenes', 'Menu.scene'), menuSource('最终'));
        EditorWebSocket.instances[0].change('src/scenes/Menu.scene');
        heldSceneReads[0].release();
        await vi.waitFor(() => expect(heldSceneReads).toHaveLength(2));
        expect((wrapper.get('input[data-prop="label"]').element as HTMLInputElement).value).toBe('本地');

        heldSceneReads[1].release();
        await vi.waitFor(() => {
            expect((wrapper.get('input[data-prop="label"]').element as HTMLInputElement).value).toBe('最终');
        });
        expect(ui.selectedLocator).toBe('0:button');
        expect(wrapper.get('button[aria-label="撤销"]').attributes('disabled')).toBeDefined();
        expect(canvasMounts).toHaveBeenCalledOnce();
        wrapper.unmount();
    });

    it('refreshes referenced Scenes, paired script interfaces, and image bytes', async () => {
        const fixture = createFixture();
        const fetcher = serviceFetcher(fixture.service);
        const canvasMounts = vi.fn();
        const projectTreeChanges = vi.fn();
        const imageSources: string[] = [];
        const SceneCanvasStub = defineComponent({
            props: { projectTree: Object },
            setup(props) {
                onMounted(canvasMounts);
                watch(() => props.projectTree, async (tree) => {
                    if (!tree) return;
                    projectTreeChanges();
                    imageSources.push(await (await readEditorProjectFile('assets/icon.svg')).text());
                }, { immediate: true });
                return () => h('div', { 'data-testid': 'scene-canvas' });
            },
        });
        vi.stubGlobal('fetch', fetcher);
        vi.stubGlobal('WebSocket', EditorWebSocket);
        const pinia = createPinia();
        setActivePinia(pinia);
        const wrapper = mount(EditorApp, {
            global: {
                plugins: [pinia],
                stubs: { SceneCanvas: SceneCanvasStub },
            },
        });

        await vi.waitFor(() => expect(imageSources.at(-1)).toBe('<svg><rect fill="#111111" /></svg>'));
        const initialProjectTreeChanges = projectTreeChanges.mock.calls.length;
        await wrapper.get('[data-locator="0:button"]').trigger('click');
        await flushPromises();
        expect(wrapper.find('input[data-prop="tone"]').exists()).toBe(false);

        fs.writeFileSync(path.join(fixture.projectRoot, 'src', 'scenes', 'ZButton.scene'), [
            '<Scene name="ZButton">',
            '  <Text id="label" text="{label}" fill="#ffffff" />',
            '</Scene>',
            '',
        ].join('\n'));
        EditorWebSocket.instances[0].change('src/scenes/ZButton.scene');
        await vi.waitFor(() => {
            expect(projectTreeChanges).toHaveBeenCalledTimes(initialProjectTreeChanges + 1);
        });

        fs.writeFileSync(path.join(fixture.projectRoot, 'src', 'scenes', 'ZButton.ts'), buttonScript(true));
        fs.writeFileSync(path.join(fixture.projectRoot, 'assets', 'icon.svg'), '<svg><rect fill="#eeeeee" /></svg>');
        EditorWebSocket.instances[0].change('src/scenes/ZButton.ts');
        EditorWebSocket.instances[0].change('assets/icon.svg');

        await vi.waitFor(() => expect(wrapper.find('input[data-prop="tone"]').exists()).toBe(true));
        await vi.waitFor(() => expect(imageSources.at(-1)).toBe('<svg><rect fill="#eeeeee" /></svg>'));
        expect(projectTreeChanges).toHaveBeenCalledTimes(initialProjectTreeChanges + 2);
        expect(canvasMounts).toHaveBeenCalledOnce();
        wrapper.unmount();
    });
});
