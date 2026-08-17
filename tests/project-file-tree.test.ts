import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Pixi from 'pixi.js';
import { BitmapLabel, Group, Label, Rect, ScrollContainer } from 'pixifact/runtime';
import {
    createCompilerSceneRuntimePreview,
} from '../apps/editor/src/preview/compilerSceneRuntimePreview';
import { incrementalScenePreviewCommands } from '../apps/editor/src/preview/scenePreviewCommands';
import { createEditorProjectTree } from '../apps/editor/src/services/editorApi';
import {
    readCompilerSceneBindingIndex,
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

async function createPreview(projectTree: ReturnType<typeof createEditorProjectTree>, scenePath: string) {
    const bindingIndex = await readCompilerSceneBindingIndex(projectTree);
    const binding = bindingIndex[scenePath];
    return createCompilerSceneRuntimePreview({
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

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('browser Editor runtime preview', () => {
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

        const index = await readCompilerSceneBindingIndex(projectTree);

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
                '<Scene name="Button" width="220" height="64">',
                '  <Rect id="background" fillColor="{tone.background}" />',
                '  <Text id="labelText" text="{label}" fill="{tone.text}" />',
                '</Scene>',
                '',
            ].join('\n'),
            'src/scenes/Button.ts': 'throw new Error("Authoring must not execute this module");\n',
            'src/scenes/Toolbar.scene': [
                '<Scene name="Toolbar">',
                '  <Button id="inventory" scene="./Button.scene" label="背包" tone="danger" />',
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
        const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pixifact-preview-texture');
        const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        const loadAsset = vi.spyOn(Pixi.Assets, 'load').mockResolvedValue(Pixi.Texture.EMPTY);

        const preview = await createPreview(projectTree, 'src/scenes/Button.scene');

        expect(loadAsset).toHaveBeenCalledWith({
            src: 'blob:pixifact-preview-texture',
            parser: 'texture',
        });
        preview.dispose();
        expect(revokeObjectUrl).toHaveBeenCalledWith('blob:pixifact-preview-texture');
        createObjectUrl.mockRestore();
    });
});
