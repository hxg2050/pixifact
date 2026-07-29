import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Pixi from 'pixi.js';
import {
    createCompilerSceneRuntimePreview,
} from '../apps/editor/src/preview/compilerSceneRuntimePreview';
import { createEditorProjectTree } from '../apps/editor/src/services/editorApi';
import {
    readCompilerSceneBindingIndex,
    sceneInterfacesForCompilerTemplate,
} from '../apps/editor/src/services/sceneBindingIndex';

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

function createProject(files: Record<string, ProjectFileContent>) {
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

    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost');
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
    it('derives Scene bindings from files served by the browser project API', async () => {
        const projectTree = createProject({
            'src/scenes/Button.scene': '<Scene name="Button" />\n',
            'src/scenes/Button.ts': [
                "import { Group } from 'pixifact/runtime';",
                "import { prop, scene } from 'pixifact/scene';",
                '',
                '@scene()',
                'export class Button extends Group {',
                "  @prop({ type: String, default: 'Button' })",
                "  accessor label = 'Button';",
                '}',
                '',
            ].join('\n'),
        });

        const index = await readCompilerSceneBindingIndex(projectTree);

        expect(index['src/scenes/Button.scene']).toMatchObject({
            className: 'Button',
            scenePath: 'src/scenes/Button.scene',
        });
        expect(index['src/scenes/Button.scene'].interface.props.label.default).toBe('Button');
        expect(fetch).toHaveBeenCalledWith('/api/file?path=src%2Fscenes%2FButton.scene');
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
