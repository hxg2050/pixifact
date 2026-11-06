// @vitest-environment node
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import { build, type Rolldown } from 'vite';
import { pixifact } from 'pixifact/compiler-node';
import { three } from '../packages/three/src/vite';

const repository = process.cwd();
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

const model = (embedded: boolean) => ({
    asset: { version: '2.0' },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    buffers: [{ byteLength: embedded ? 40 : 36, ...(embedded ? {} : { uri: 'world.bin' }) }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, ...(embedded ? [{ buffer: 0, byteOffset: 36, byteLength: 4 }] : [])],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-1, -1, 0], max: [1, 1, 0] }],
    images: [embedded ? { bufferView: 1, mimeType: 'image/png' } : { uri: 'tex.png' }],
    textures: [{ source: 0 }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
});

function glb() {
    const json = Buffer.from(JSON.stringify(model(true)).padEnd(Math.ceil(JSON.stringify(model(true)).length / 4) * 4, ' '));
    const bytes = Buffer.alloc(12 + 8 + json.length + 8 + 40);
    bytes.writeUInt32LE(0x46546c67, 0);
    bytes.writeUInt32LE(2, 4);
    bytes.writeUInt32LE(bytes.length, 8);
    bytes.writeUInt32LE(json.length, 12);
    bytes.writeUInt32LE(0x4e4f534a, 16);
    json.copy(bytes, 20);
    bytes.writeUInt32LE(40, 20 + json.length);
    bytes.writeUInt32LE(0x004e4942, 24 + json.length);
    Buffer.from(new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]).buffer).copy(bytes, 28 + json.length);
    return bytes;
}

async function fixture() {
    const root = await mkdtemp(path.join(repository, '.pixifact-three-test-'));
    roots.push(root);
    await writeFile(path.join(root, 'tsconfig.json'), JSON.stringify({
        compilerOptions: { experimentalDecorators: true, useDefineForClassFields: true },
    }));
    await mkdir(path.join(root, 'src/scenes'), { recursive: true });
    await mkdir(path.join(root, 'resources/models'), { recursive: true });
    await writeFile(path.join(root, 'pixifact.project.json'), JSON.stringify({
        version: 2, name: 'Three fixture', scenes: { main: 'src/scenes/Main.scene' }, resourcePacks: ['models'],
    }));
    await writeFile(path.join(root, 'index.html'), '<script type="module" src="/src/main.ts"></script>');
    await writeFile(path.join(root, 'src/scenes/Main.scene'), '<Scene name="Main" width="800" height="600" />\n');
    await writeFile(path.join(root, 'src/scenes/Main.ts'), "import { Group } from 'pixifact/runtime'; import { scene } from 'pixifact/scene'; @scene() export class Main extends Group {}\n");
    for (const mode of ['web', 'wechat', 'douyin']) {
        await writeFile(path.join(root, `.env.${mode}`), `VITE_PLATFORM=${mode}\nVITE_APP_ID=test-app-id\n`);
        if (mode === 'web') continue;
        await mkdir(path.join(root, 'platforms', mode), { recursive: true });
        for (const file of ['game.json', 'project.config.json']) await writeFile(path.join(root, 'platforms', mode, file), '{}\n');
    }
    await writeFile(path.join(root, 'src/main.ts'), `import 'pixifact:scenes';
import { createApplication } from 'pixifact:platform';
globalThis.createApp = createApplication;
globalThis.loadGame = () => import('./game');`);
    await writeFile(path.join(root, 'src/game.ts'), `import { createThreeLayer } from '@pixifact/three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DOMAdapter } from 'pixi.js';
import { createMiniGameSubpackageLoader, fetchMiniGameResource, miniGameResourceSubpackage } from 'pixifact/internal/minigame';
export { createThreeLayer };
export function loadModel(api, url) {
    const loadPackage = createMiniGameSubpackageLoader(api, 'test');
    DOMAdapter.set({ createImage: () => api.createImage(), fetch: async (url) => {
        const pack = miniGameResourceSubpackage(url);
        if (pack) await loadPackage(pack);
        return fetchMiniGameResource(api, url, {}, 'test');
    }});
    return new GLTFLoader().loadAsync(url);
}`);
    await writeFile(path.join(root, 'resources/models/world.gltf'), JSON.stringify(model(false)));
    await writeFile(path.join(root, 'resources/models/world.bin'), Buffer.from(new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]).buffer));
    await writeFile(path.join(root, 'resources/models/world.glb'), glb());
    await writeFile(path.join(root, 'resources/models/tex.png'), 'decoded by native host');
    return root;
}

async function buildFixture(root: string, mode: string, codePackage = true) {
    const chunks: Rolldown.OutputChunk[] = [];
    const source = path.join(repository, 'packages/pixifact/src');
    const threeSource = path.join(repository, 'packages/three/src');
    await build({
        root, mode, configFile: false, logLevel: 'silent',
        plugins: [pixifact({ codePackages: codePackage ? { game: 'src/game.ts' } : undefined }), three(), {
            name: 'capture-three-chunks',
            generateBundle(_, bundle) {
                for (const entry of Object.values(bundle)) if (entry.type === 'chunk') chunks.push(entry);
            },
        }],
        resolve: { alias: [
            { find: '@pixifact/three/internal/resources', replacement: `${threeSource}/nativeResources.ts` },
            { find: '@pixifact/three/internal/loaders', replacement: `${threeSource}/nativeLoaders.ts` },
            { find: '@pixifact/three', replacement: `${threeSource}/index.ts` },
            { find: '@pixifact/platform-wechat', replacement: path.join(repository, 'packages/platform-wechat/src/index.ts') },
            { find: '@pixifact/platform-douyin', replacement: path.join(repository, 'packages/platform-douyin/src/index.ts') },
            { find: 'pixifact/internal/minigame', replacement: `${source}/platform/minigame/index.ts` },
            { find: /^pixifact\/(.+)$/, replacement: `${source}/$1` },
            { find: 'pixifact', replacement: `${source}/index.ts` },
        ] },
    });
    return { chunks, output: path.join(root, 'dist', mode) };
}

function nativeRuntime(output: string, platform: string) {
    const loaded = new Set<string>();
    const downloads: string[] = [];
    const images: string[] = [];
    const temporary = new Map<string, ArrayBuffer>();
    const deleted: string[] = [];
    const errors: string[] = [];
    let failNextImage = false;
    const cache = new Map<string, { exports: any }>();
    const api = {
        env: { USER_DATA_PATH: '/user' },
        base64ToArrayBuffer: (data: string) => Uint8Array.from(Buffer.from(data, 'base64')).buffer,
        loadSubpackage({ name, success }: { name: string; success(): void }) {
            downloads.push(name); loaded.add(name);
            requireFile(path.join(output, 'subpackages', name, 'game.js'));
            success();
        },
        getFileSystemManager: () => ({
            readFile({ filePath, success }: any) {
                const pack = filePath.match(/^subpackages\/([^/]+)\//)?.[1];
                if (pack && !loaded.has(pack)) throw new Error('Resource accessed before package loaded');
                success({ data: Uint8Array.from(readFileSync(path.join(output, filePath))).buffer });
            },
            writeFile({ filePath, data, success }: any) { temporary.set(filePath, data); success(); },
            unlink({ filePath, success }: any) { temporary.delete(filePath); deleted.push(filePath); success(); },
        }),
        createImage() {
            let src = '';
            return {
                width: 1, height: 1, complete: true, onload: null as (() => void) | null, onerror: null as ((error: Error) => void) | null,
                get src() { return src; },
                set src(value: string) {
                    src = value;
                    images.push(value);
                    const fail = failNextImage;
                    failNextImage = false;
                    queueMicrotask(() => { if (fail) this.onerror!(new Error('decode failed')); else this.onload!(); });
                },
            };
        },
    };
    const context = createContext({ console: { ...console, error: (...values: unknown[]) => errors.push(values.join(' ')) }, ArrayBuffer, setTimeout, clearTimeout, [platform === 'wechat' ? 'wx' : 'tt']: api });
    function requireFile(file: string): any {
        const cached = cache.get(file);
        if (cached) return cached.exports;
        const module = { exports: {} };
        cache.set(file, module);
        const factory = runInContext(`(function(require, module, exports) {\n${readFileSync(file, 'utf8')}\n})`, context);
        factory((specifier: string) => requireFile(path.resolve(path.dirname(file), specifier)), module, module.exports);
        return module.exports;
    }
    requireFile(path.join(output, 'game.js'));
    return { context, api, downloads, images, temporary, deleted, errors, failImage() { failNextImage = true; } };
}

describe('@pixifact/three Vite integration', () => {
    it.each(['wechat', 'douyin'])('loads real glTF and GLB from %s CommonJS subpackages without browser globals', async (platform) => {
        const root = await fixture();
        const { output, chunks } = await buildFixture(root, platform);
        const engineChunks = chunks.filter((chunk) => chunk.moduleIds.some((id) => /\/three\/(src|examples)\//.test(id)));
        expect(engineChunks.map((chunk) => chunk.fileName)).toEqual(['subpackages/game/game.js']);
        const config = JSON.parse(await readFile(path.join(output, 'game.json'), 'utf8'));
        expect(config[platform === 'wechat' ? 'subpackages' : 'subPackages'].map((p: any) => p.name).sort()).toEqual(['game', 'models']);
        const runtime = nativeRuntime(output, platform);
        const game = await runtime.context.loadGame();
        expect(typeof game.createThreeLayer).toBe('function');
        const gltf = await game.loadModel(runtime.api, 'subpackages/models/world.gltf');
        expect(gltf.scene.children[0].geometry.attributes.position.count).toBe(3);
        expect(gltf.scene.children[0].material.map.image.src).toBe('subpackages/models/tex.png');
        const embedded = await game.loadModel(runtime.api, 'subpackages/models/world.glb');
        expect(embedded.scene.children[0].geometry.attributes.position.count).toBe(3);
        expect(runtime.images[1]).toMatch(/^\/user\/pixifact-three-.*\.png$/);
        expect(runtime.temporary.size).toBe(0);
        expect(runtime.deleted).toHaveLength(1);
        runtime.failImage();
        // Three 原生 GLTFLoader 会记录纹理错误并保留几何；临时文件仍需清理。
        const withoutTexture = await game.loadModel(runtime.api, 'subpackages/models/world.glb');
        expect(withoutTexture.scene.children[0].material.map).toBeNull();
        expect(runtime.errors.join(' ')).toContain("Couldn't load texture");
        expect(runtime.temporary.size).toBe(0);
        expect(runtime.deleted).toHaveLength(2);
        expect(runtime.downloads).toEqual(['game', 'models']);
        expect(runInContext('typeof document + ":" + typeof fetch + ":" + typeof TextDecoder + ":" + typeof Blob', runtime.context)).toBe('undefined:undefined:undefined:undefined');
    }, 30_000);

    it('keeps native Three loaders on Web and leaves a 2D application free of Three', async () => {
        const root = await fixture();
        const { chunks } = await buildFixture(root, 'web');
        expect(chunks.some((chunk) => chunk.moduleIds.some((id) => id.endsWith('/three/build/three.core.js')))).toBe(true);
        expect(chunks.some((chunk) => chunk.moduleIds.some((id) => id.endsWith('/three/src/nativeLoaders.ts')))).toBe(false);
        await writeFile(path.join(root, 'src/main.ts'), "import 'pixifact:scenes'; import { createApplication } from 'pixifact:platform'; globalThis.createApp = createApplication;");
        const flat = await buildFixture(root, 'wechat', false);
        expect(flat.chunks.flatMap((chunk) => chunk.moduleIds).filter((id) => /\/(three|packages\/three)\//.test(id))).toEqual([]);
    }, 30_000);
});
