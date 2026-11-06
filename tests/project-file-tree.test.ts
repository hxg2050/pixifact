import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Pixi from 'pixi.js';
import { BitmapLabel, Group, Label, Rect, ScrollContainer } from 'pixifact/runtime';
import {
    createCompilerSceneRuntimePreview,
    CompilerScenePreviewCache,
} from '../apps/editor/src/preview/compilerSceneRuntimePreview';
import { incrementalScenePreviewCommands } from '../apps/editor/src/preview/scenePreviewCommands';
import { createEditorProjectTree } from '../apps/editor/src/services/editorApi';
import {
    CompilerSceneBindingCache,
    sceneInterfacesForCompilerTemplate,
} from '../apps/editor/src/services/sceneBindingIndex';
import type { SceneScriptInterface } from 'pixifact/compiler';

type ProjectFileContent = string | Uint8Array;

function sceneScript(className: string) {
    return [
        "import { Group } from 'pixifact/runtime';",
        "import { scene } from 'pixifact/scene';",
        '',
        '@scene()',
        `export class ${className} extends Group {}`,
        '',
    ].join('\n');
}

function createProject(
    files: Record<string, ProjectFileContent>,
    sceneBindings: Record<string, SceneScriptInterface> = {},
) {
    const fileEntries = Object.keys(files).map((path) => ({
        kind: path.endsWith('.scene')
            ? 'scene' as const
            : /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(path)
                ? 'script' as const
                : /\.(?:png|jpe?g|webp|gif|svg)$/.test(path)
                    ? 'image' as const
                    : 'file' as const,
        path,
    }));
    const projectTree = createEditorProjectTree({
        files: fileEntries,
        images: fileEntries.filter((file) => file.kind === 'image').map((file) => file.path),
        name: 'GameProject',
        root: '/tmp/GameProject',
        scenes: fileEntries.filter((file) => file.kind === 'scene').map((file) => file.path),
    });
    const bindings = {
        ...Object.fromEntries(fileEntries.filter((file) => file.kind === 'scene').map((file) => {
            const className = file.path.split('/').at(-1)!.replace(/\.scene$/, '');
            return [file.path, {
                scene: file.path,
                className,
                interface: { props: {}, events: {}, slots: {} },
                parts: {},
            } satisfies SceneScriptInterface];
        })),
        ...sceneBindings,
    };

    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost');
        if (url.pathname === '/api/scene-bindings') {
            return Response.json(bindings);
        }
        const path = url.searchParams.get('path') ?? '';
        const content = files[path];
        return content === undefined
            ? new Response(JSON.stringify({ error: 'Project file not found.' }), {
                status: 404,
                headers: { 'content-type': 'application/json' },
            })
            : new Response(content);
    }));

    return projectTree;
}

const previewCaches: CompilerScenePreviewCache[] = [];
function previewCache(unusedBytes?: number) {
    const cache = new CompilerScenePreviewCache(unusedBytes);
    previewCaches.push(cache);
    return cache;
}

async function createPreview(projectTree: ReturnType<typeof createEditorProjectTree>, scenePath: string, cache = previewCache(), signal?: AbortSignal) {
    const bindingIndex = await cache.bindings.readIndex(projectTree, scenePath, undefined, signal);
    const binding = bindingIndex[scenePath];
    return createCompilerSceneRuntimePreview({
        cache,
        signal,
        document: {
            template: binding.template,
            sceneInterfaces: sceneInterfacesForCompilerTemplate(
                bindingIndex,
                binding.template.children,
                binding.scenePath,
            ),
        },
        projectTree,
        scenePath,
    });
}

afterEach(async () => {
    await Promise.all(previewCaches.splice(0).map((cache) => cache.clear()));
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('browser Editor runtime preview', () => {
    it('reuses unchanged templates, contracts, and textures across Scene switches', async () => {
        const projectTree = createProject({
            'src/scenes/A.scene': '<Scene name="A"><Image id="image" texture="assets/shared.png" /></Scene>',
            'src/scenes/A.ts': sceneScript('A'),
            'src/scenes/B.scene': '<Scene name="B"><Rect /></Scene>',
            'src/scenes/B.ts': sceneScript('B'),
            'assets/shared.png': new Uint8Array([1]),
        });
        const load = vi.spyOn(Pixi.Assets, 'load').mockResolvedValue(Pixi.Texture.EMPTY);
        const unload = vi.spyOn(Pixi.Assets, 'unload').mockResolvedValue();
        const cache = previewCache();
        for (const path of ['A', 'B', 'A', 'B', 'A']) {
            const preview = await createPreview(projectTree, `src/scenes/${path}.scene`, cache);
            preview.dispose();
        }
        expect(load).toHaveBeenCalledOnce();
        expect(fetch).toHaveBeenCalledTimes(3);
        expect(unload).not.toHaveBeenCalled();
        await cache.clear();
        expect(unload).toHaveBeenCalledOnce();
    });

    it('invalidates changed child templates and textures while retaining active texture users', async () => {
        const files = {
            'src/scenes/Main.scene': '<Scene name="Main"><Child id="child" scene="./Child.scene" /></Scene>',
            'src/scenes/Main.ts': sceneScript('Main'),
            'src/scenes/Child.scene': '<Scene name="Child"><Image id="icon" texture="assets/icon.png" /><Rect id="rect" fillColor="#111111" /></Scene>',
            'src/scenes/Child.ts': sceneScript('Child'),
            'assets/icon.png': new Uint8Array([1]),
        };
        const projectTree = createProject(files);
        const load = vi.spyOn(Pixi.Assets, 'load').mockResolvedValue(Pixi.Texture.EMPTY);
        const unload = vi.spyOn(Pixi.Assets, 'unload').mockResolvedValue();
        const cache = previewCache();
        const previous = await createPreview(projectTree, 'src/scenes/Main.scene', cache);
        files['src/scenes/Child.scene'] = files['src/scenes/Child.scene'].replace('#111111', '#eeeeee');
        cache.invalidate(['src/scenes/Child.scene', 'assets/icon.png']);
        const next = await createPreview(projectTree, 'src/scenes/Main.scene', cache);
        expect((next.nodes.get('0:child')!.children[1] as Rect).fillColor).toBe(0xeeeeee);
        expect(load).toHaveBeenCalledTimes(2);
        expect(load.mock.calls[1][0]).not.toEqual(load.mock.calls[0][0]);
        expect(unload).not.toHaveBeenCalled();
        previous.dispose();
        expect(unload).toHaveBeenCalledWith(load.mock.calls[0][0].src);
        next.dispose();
        await cache.clear();
        expect(unload).toHaveBeenCalledTimes(2);
    });

    it('cancels an obsolete preview without cancelling a shared image load', async () => {
        const projectTree = createProject({
            'src/scenes/Main.scene': '<Scene name="Main"><Image id="image" texture="assets/shared.png" /></Scene>',
            'src/scenes/Main.ts': sceneScript('Main'),
            'assets/shared.png': new Uint8Array([1]),
        });
        let finish!: (texture: Pixi.Texture) => void;
        const load = vi.spyOn(Pixi.Assets, 'load').mockReturnValue(new Promise((resolve) => { finish = resolve; }));
        const unload = vi.spyOn(Pixi.Assets, 'unload').mockResolvedValue();
        const cache = previewCache();
        const controller = new AbortController();
        const obsolete = createPreview(projectTree, 'src/scenes/Main.scene', cache, controller.signal);
        const rejected = expect(obsolete).rejects.toMatchObject({ name: 'AbortError' });
        await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
        const latest = createPreview(projectTree, 'src/scenes/Main.scene', cache);
        await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
        controller.abort();
        await rejected;
        expect(unload).not.toHaveBeenCalled();
        finish(Pixi.Texture.EMPTY);
        const preview = await latest;
        expect(preview.nodes.has('0:image')).toBe(true);
        expect(load).toHaveBeenCalledOnce();
        preview.dispose();
        await cache.clear();
        expect(unload).toHaveBeenCalledOnce();
    });

    it('evicts least recently used idle textures without unloading active previews', async () => {
        const projectTree = createProject({
            'src/scenes/A.scene': '<Scene name="A"><Image texture="assets/a.png" /></Scene>',
            'src/scenes/A.ts': sceneScript('A'),
            'src/scenes/B.scene': '<Scene name="B"><Image texture="assets/b.png" /></Scene>',
            'src/scenes/B.ts': sceneScript('B'),
            'assets/a.png': new Uint8Array([1]),
            'assets/b.png': new Uint8Array([2]),
        });
        const load = vi.spyOn(Pixi.Assets, 'load').mockResolvedValue(Pixi.Texture.EMPTY);
        const unload = vi.spyOn(Pixi.Assets, 'unload').mockResolvedValue();
        const cache = previewCache(4);
        const a = await createPreview(projectTree, 'src/scenes/A.scene', cache);
        const b = await createPreview(projectTree, 'src/scenes/B.scene', cache);
        expect(unload).not.toHaveBeenCalled();
        a.dispose();
        expect(unload).not.toHaveBeenCalled();
        b.dispose();
        expect(unload).toHaveBeenCalledWith(load.mock.calls[0][0].src);
        expect(unload).toHaveBeenCalledOnce();
        await cache.clear();
        expect(unload).toHaveBeenCalledTimes(2);
    });

    it('releases successful loads after a sibling image fails and permits retry', async () => {
        const projectTree = createProject({
            'src/scenes/Main.scene': '<Scene name="Main"><Image texture="assets/a.png" /><Image texture="assets/b.png" /></Scene>',
            'src/scenes/Main.ts': sceneScript('Main'),
            'assets/a.png': new Uint8Array([1]),
            'assets/b.png': new Uint8Array([2]),
        });
        const load = vi.spyOn(Pixi.Assets, 'load').mockResolvedValue(Pixi.Texture.EMPTY);
        load.mockRejectedValueOnce(new Error('图片读取失败'));
        const unload = vi.spyOn(Pixi.Assets, 'unload').mockResolvedValue();
        const cache = previewCache(0);
        await expect(createPreview(projectTree, 'src/scenes/Main.scene', cache)).rejects.toThrow('图片读取失败');
        expect(unload).toHaveBeenCalledOnce();
        const preview = await createPreview(projectTree, 'src/scenes/Main.scene', cache);
        preview.dispose();
        await cache.clear();
        expect(load).toHaveBeenCalledTimes(4);
        expect(unload).toHaveBeenCalledTimes(3);
    });

    it('releases textures when node construction fails', async () => {
        const projectTree = createProject({
            'src/scenes/Main.scene': '<Scene name="Main"><Image texture="assets/a.png" /></Scene>',
            'src/scenes/Main.ts': sceneScript('Main'),
            'assets/a.png': new Uint8Array([1]),
        });
        vi.spyOn(Pixi.Assets, 'load').mockResolvedValue(Pixi.Texture.EMPTY);
        const unload = vi.spyOn(Pixi.Assets, 'unload').mockResolvedValue();
        vi.spyOn(Group.prototype, 'setSize').mockImplementationOnce(() => { throw new Error('节点构建失败'); });
        const cache = previewCache(0);
        await expect(createPreview(projectTree, 'src/scenes/Main.scene', cache)).rejects.toThrow('节点构建失败');
        await cache.clear();
        expect(unload).toHaveBeenCalledOnce();
    });

    it('waits for retired in-flight textures to unload when clearing the cache', async () => {
        const projectTree = createProject({ 'assets/image.png': new Uint8Array([1]) });
        let finish!: (texture: Pixi.Texture) => void;
        vi.spyOn(Pixi.Assets, 'load').mockReturnValue(new Promise((resolve) => { finish = resolve; }));
        const unload = vi.spyOn(Pixi.Assets, 'unload').mockResolvedValue();
        const cache = previewCache();
        const lease = cache.acquire(projectTree, 'assets/image.png');
        cache.invalidate(['assets/image.png']);
        lease.release();
        let cleared = false;
        const clearing = cache.clear().then(() => { cleared = true; });
        await new Promise((resolve) => setTimeout(resolve, 0));
        const clearedBeforeLoad = cleared;
        finish(Pixi.Texture.EMPTY);
        await clearing;
        expect(clearedBeforeLoad).toBe(false);
        expect(unload).toHaveBeenCalledOnce();
    });

    it('does not load unrelated Scene textures when previewing a texture-free Scene', async () => {
        const projectTree = createProject({
            'src/scenes/Hud.scene': '<Scene name="Hud"><Rect id="panel" width="80" height="40" /></Scene>',
            'src/scenes/Hud.ts': sceneScript('Hud'),
            'src/scenes/Unrelated.scene': '<Scene name="Unrelated"><Image texture="assets/large.png" /></Scene>',
            'src/scenes/Unrelated.ts': sceneScript('Unrelated'),
            'assets/large.png': new Uint8Array([1]),
        });
        const loadAsset = vi.spyOn(Pixi.Assets, 'load').mockResolvedValue(Pixi.Texture.EMPTY);
        const preview = await createPreview(projectTree, 'src/scenes/Hud.scene');
        expect(loadAsset).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalledWith('/api/file?path=src%2Fscenes%2FUnrelated.scene');
        preview.dispose();
    });

    it('rebuilds when removing frame constraints so authored position and intrinsic size are restored', () => {
        for (const prop of ['left', 'right', 'top', 'bottom', 'horizontal', 'vertical']) {
            const enabled = { op: 'setNodeProp' as const, node: '0:title', prop, value: 0 };
            const removed = { op: 'setNodeProp' as const, node: '0:title', prop, value: undefined };
            expect(incrementalScenePreviewCommands(enabled, removed)).toEqual([enabled]);
            expect(incrementalScenePreviewCommands(removed, enabled)).toBeUndefined();
            expect(incrementalScenePreviewCommands(
                { op: 'batch', commands: [removed] },
                { op: 'batch', commands: [enabled] },
            )).toBeUndefined();
        }
    });

    it('rebuilds the Scene root for structure, Binding, and resource commands', () => {
        expect(incrementalScenePreviewCommands({
            op: 'setNodeProp',
            node: '0:title',
            prop: 'x',
            value: 48,
        }, {
            op: 'setNodeProp',
            node: '0:title',
            prop: 'x',
            value: 20,
        })).toEqual([{
            op: 'setNodeProp',
            node: '0:title',
            prop: 'x',
            value: 48,
        }]);

        expect(incrementalScenePreviewCommands({
            op: 'deleteNode',
            node: '0:title',
        }, {
            op: 'insertNode',
            parent: '__scene__',
            index: 0,
            node: { kind: 'pixi', type: 'Text', id: 'title', props: {}, children: [] },
        })).toBeUndefined();

        expect(incrementalScenePreviewCommands({
            op: 'setNodeId',
            node: '0:title',
            value: 'headline',
        }, {
            op: 'setNodeId',
            node: '0:headline',
            value: 'title',
        })).toBeUndefined();

        expect(incrementalScenePreviewCommands({
            op: 'setNodeProp',
            node: '0:title',
            prop: 'text',
            value: 'Button',
        }, {
            op: 'setNodeProp',
            node: '0:title',
            prop: 'text',
            value: { kind: 'binding', path: ['label'] },
        })).toBeUndefined();

        expect(incrementalScenePreviewCommands({
            op: 'setNodeProp',
            node: '0:icon',
            prop: 'texture',
            value: 'assets/icons/bag.svg',
        }, {
            op: 'setNodeProp',
            node: '0:icon',
            prop: 'texture',
            value: 'assets/icons/map.svg',
        })).toBeUndefined();
    });

    it('derives Scene bindings from files served by the browser project API', async () => {
        const projectTree = createProject({
            'src/scenes/Button.scene': '<Scene name="Button" />\n',
            'src/scenes/Button.ts': 'throw new Error("Editor must not execute project scripts");\n',
        }, {
            'src/scenes/Button.scene': {
                scene: 'src/scenes/Button.scene',
                className: 'Button',
                interface: {
                    props: { label: { type: 'string', default: 'Button' } },
                    events: {},
                    slots: {},
                },
                parts: {},
            },
        });

        const index = await new CompilerSceneBindingCache().readIndex(projectTree, 'src/scenes/Button.scene');

        expect(index['src/scenes/Button.scene']).toMatchObject({
            className: 'Button',
            scenePath: 'src/scenes/Button.scene',
        });
        expect(index['src/scenes/Button.scene'].interface.props.label.default).toBe('Button');
        expect(fetch).toHaveBeenCalledWith('/api/file?path=src%2Fscenes%2FButton.scene');
        expect(fetch).not.toHaveBeenCalledWith('/api/file?path=src%2Fscenes%2FButton.ts');
    });

    it('renders Pixifact nodes and layout from the current Scene document', async () => {
        const projectTree = createProject({
            'src/scenes/Hud.scene': [
                '<Scene name="Hud" width="400" height="240">',
                '  <Rect id="panel" left="20" right="30" top="10" bottom="15" fillColor="#111827" radius="12" />',
                '</Scene>',
                '',
            ].join('\n'),
            'src/scenes/Hud.ts': sceneScript('Hud'),
        });

        const preview = await createPreview(projectTree, 'src/scenes/Hud.scene');
        const panel = preview.nodes.get('0:panel');

        expect(panel?.constructor.name).toBe('Rect');
        expect(panel).toMatchObject({
            x: 20,
            y: 10,
            width: 350,
            height: 215,
            fillColor: 0x111827,
            radius: 12,
        });
        preview.dispose();
    });

    it('renders Label through the safe Authoring preview', async () => {
        const projectTree = createProject({
            'src/scenes/Hud.scene': [
                '<Scene name="Hud" width="400" height="240">',
                '  <Label id="title" width="240" height="72" text="Inventory" fontSize="24" wordWrap="true" alignX="center" alignY="center" overflow="clip" />',
                '</Scene>',
                '',
            ].join('\n'),
            'src/scenes/Hud.ts': 'throw new Error("Editor must not execute project scripts");\n',
        });

        const preview = await createPreview(projectTree, 'src/scenes/Hud.scene');
        const title = preview.nodes.get('0:title');

        expect(title).toBeInstanceOf(Label);
        expect(title).toMatchObject({
            width: 240,
            height: 72,
            text: 'Inventory',
            fontSize: 24,
            wordWrap: true,
            alignX: 'center',
            alignY: 'center',
            overflow: 'clip',
        });
        expect(fetch).not.toHaveBeenCalledWith('/api/file?path=src%2Fscenes%2FHud.ts');
        preview.dispose();
    });

    it('renders BitmapLabel through the safe Authoring preview', async () => {
        const projectTree = createProject({
            'src/scenes/Hud.scene': [
                '<Scene name="Hud" width="400" height="240">',
                '  <BitmapLabel id="gold" width="180" height="48" text="1280" fontFamily="AntCount" fontSize="32" alignX="end" alignY="center" overflow="clip" />',
                '</Scene>',
                '',
            ].join('\n'),
            'src/scenes/Hud.ts': 'throw new Error("Editor must not execute project scripts");\n',
        });

        const preview = await createPreview(projectTree, 'src/scenes/Hud.scene');
        const gold = preview.nodes.get('0:gold');

        expect(gold).toBeInstanceOf(BitmapLabel);
        expect(gold).toMatchObject({
            width: 180,
            height: 48,
            text: '1280',
            fontFamily: 'AntCount',
            fontSize: 32,
            alignX: 'end',
            alignY: 'center',
            overflow: 'clip',
        });
        expect(fetch).not.toHaveBeenCalledWith('/api/file?path=src%2Fscenes%2FHud.ts');
        preview.dispose();
    });

    it('renders ScrollContainer visual state without activating runtime input behavior', async () => {
        const projectTree = createProject({
            'src/scenes/Inventory.scene': [
                '<Scene name="Inventory" width="400" height="240">',
                '  <ScrollContainer id="items" width="100" height="60" scrollY="20">',
                '    <Rect id="content" width="100" height="180" />',
                '  </ScrollContainer>',
                '</Scene>',
                '',
            ].join('\n'),
            'src/scenes/Inventory.ts': 'throw new Error("Editor must not execute project scripts");\n',
        });

        const preview = await createPreview(projectTree, 'src/scenes/Inventory.scene');
        const items = preview.nodes.get('0:items') as ScrollContainer;
        const wheelEvent = {
            deltaX: 0,
            deltaY: 24,
            preventDefault: vi.fn(),
            stopPropagation: vi.fn(),
        };

        expect(items).toBeInstanceOf(ScrollContainer);
        expect(items.contentLayer.mask).toBeInstanceOf(Pixi.Graphics);
        expect(items.contentLayer.children).toHaveLength(1);
        expect(items.scrollY).toBe(20);
        expect(items.contentLayer.y).toBe(-20);

        items.emit('wheel', wheelEvent);

        expect(items.scrollY).toBe(20);
        expect(items.contentLayer.y).toBe(-20);
        expect(wheelEvent.preventDefault).not.toHaveBeenCalled();
        expect(wheelEvent.stopPropagation).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalledWith('/api/file?path=src%2Fscenes%2FInventory.ts');
        preview.dispose();
    });

    it('renders Scene Instance Props and Variants through static Authoring bindings', async () => {
        const projectTree = createProject({
            'src/scenes/Button.scene': [
                '<Scene name="Button" width="220" height="64" default.label="编辑器">',
                '  <Rect id="background" fillColor="{tone.background}" />',
                '  <Text id="labelText" text="{label}" fill="{tone.text}" />',
                '</Scene>',
                '',
            ].join('\n'),
            'src/scenes/Button.ts': 'throw new Error("Authoring must not execute this module");\n',
            'src/scenes/Toolbar.scene': [
                '<Scene name="Toolbar">',
                '  <Button id="inventory" scene="./Button.scene" label="背包" tone="danger" />',
                '  <Button id="shop" scene="./Button.scene" />',
                '</Scene>',
                '',
            ].join('\n'),
            'src/scenes/Toolbar.ts': sceneScript('Toolbar'),
        }, {
            'src/scenes/Button.scene': {
                scene: 'src/scenes/Button.scene',
                className: 'Button',
                interface: {
                    props: {
                        label: { type: 'string', default: 'Button' },
                        tone: {
                            type: 'variant',
                            default: 'primary',
                            variants: {
                                primary: { background: '#24456f', text: '#fff3cf' },
                                danger: { background: '#713044', text: '#fff0f4' },
                            },
                        },
                    },
                    events: {},
                    slots: {},
                },
                parts: {},
            },
        });

        const preview = await createPreview(projectTree, 'src/scenes/Toolbar.scene');
        const inventory = preview.nodes.get('0:inventory') as Group & { label: string; tone: string };
        const background = inventory.children[0] as Rect;
        const label = inventory.children[1] as Pixi.Text;

        expect(preview.nodes.has('0:inventory/0:background')).toBe(false);
        expect(background.fillColor).toBe(0x713044);
        expect(label.text).toBe('背包');
        expect((preview.nodes.get('1:shop') as Group).children[1]).toMatchObject({ text: '编辑器' });

        inventory.label = '仓库';
        inventory.tone = 'primary';

        expect(label.text).toBe('仓库');
        expect(background.fillColor).toBe(0x24456f);
        expect(fetch).not.toHaveBeenCalledWith('/api/file?path=src%2Fscenes%2FButton.ts');
        preview.dispose();
    });

    it('loads project images through the browser file API and an explicit Pixi parser', async () => {
        const projectTree = createProject({
            'assets/play.png': new TextEncoder().encode('fake-png'),
            'src/scenes/Button.scene': [
                '<Scene name="Button">',
                '  <Sprite id="icon" texture="assets/play.png" />',
                '</Scene>',
                '',
            ].join('\n'),
            'src/scenes/Button.ts': sceneScript('Button'),
        });
        const unloadAsset = vi.spyOn(Pixi.Assets, 'unload').mockResolvedValue();
        const cache = previewCache();
        const loadAsset = vi.spyOn(Pixi.Assets, 'load').mockResolvedValue(Pixi.Texture.EMPTY);

        const preview = await createPreview(projectTree, 'src/scenes/Button.scene', cache);

        expect(loadAsset).toHaveBeenCalledWith({
            src: expect.stringMatching(/^\/api\/file\?path=assets%2Fplay\.png&v=/),
            parser: 'texture',
        });
        preview.dispose();
        expect(unloadAsset).not.toHaveBeenCalled();
        await cache.clear();
        expect(unloadAsset).toHaveBeenCalledWith(loadAsset.mock.calls[0][0].src);
    });
});
