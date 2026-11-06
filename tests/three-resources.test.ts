import { afterEach, describe, expect, it, vi } from 'vitest';
import { DOMAdapter } from 'pixi.js';
import { createNativeThreeResources, NativeBlob, NativeTextDecoder, type ThreeMiniGameApi } from '../packages/three/src/nativeResources';

afterEach(() => vi.restoreAllMocks());

function setup() {
    const read = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
    vi.spyOn(DOMAdapter, 'get').mockReturnValue({ fetch: read } as never);
    const files = new Map<string, ArrayBuffer>();
    const writeFile = vi.fn(({ filePath, data, success }) => { files.set(filePath, data); success(); });
    const unlink = vi.fn(({ filePath, success }) => { files.delete(filePath); success(); });
    const loadSubpackage = vi.fn(({ success }) => success());
    const api = {
        env: { USER_DATA_PATH: '/user' },
        base64ToArrayBuffer: (data: string) => Uint8Array.from(atob(data), (c) => c.charCodeAt(0)).buffer,
        getFileSystemManager: () => ({ writeFile, unlink }),
        loadSubpackage,
    } as unknown as ThreeMiniGameApi;
    const resources = createNativeThreeResources(() => api, 'wechat');
    return { resources, api, files, read, writeFile, unlink, loadSubpackage };
}

describe('Three native resource bridge', () => {
    it('prepares image subpackages through the shared download state before assigning src', async () => {
        const { resources, loadSubpackage } = setup();
        await expect(resources.prepareImage('subpackages/models/textures/a.png')).resolves.toMatchObject({
            src: 'subpackages/models/textures/a.png',
        });
        await resources.prepareImage('subpackages/models/textures/b.png');
        expect(loadSubpackage).toHaveBeenCalledOnce();
        expect(loadSubpackage.mock.calls[0][0].name).toBe('models');
    });

    it('reads local and HTTPS binaries through the existing DOMAdapter', async () => {
        const { resources, read } = setup();
        expect(new Uint8Array(await resources.read('subpackages/models/world.bin'))).toEqual(new Uint8Array([1, 2, 3]));
        await resources.read('https://cdn.example.com/a.bin');
        expect(read.mock.calls.map(([url]) => url)).toEqual(['subpackages/models/world.bin', 'https://cdn.example.com/a.bin']);
        read.mockResolvedValue(new Response('', { status: 404 }));
        await expect(resources.read('missing.bin')).rejects.toThrow('404');
    });

    it('materializes embedded GLB images and removes the temporary file after decode', async () => {
        const { resources, files, unlink } = setup();
        const blob = new NativeBlob([new Uint8Array([5, 6, 7]).buffer], { type: 'image/png' });
        const url = resources.URL.createObjectURL(blob);
        const image = await resources.prepareImage(url);
        expect(image.src).toMatch(/^\/user\/pixifact-three-.*\.png$/);
        expect(new Uint8Array(files.get(image.src)!)).toEqual(new Uint8Array([5, 6, 7]));
        await image.release();
        resources.URL.revokeObjectURL(url);
        expect(files.size).toBe(0);
        expect(unlink).toHaveBeenCalledOnce();
    });

    it('decodes embedded data and UTF-8 glTF without browser fetch or TextDecoder', async () => {
        const { resources } = setup();
        const bytes = new Uint8Array(await resources.read('data:application/octet-stream;base64,AQID'));
        expect([...bytes]).toEqual([1, 2, 3]);
        const prepared = await resources.prepareImage('data:image/png;base64,AQID');
        expect(prepared.src).toMatch(/\.png$/);
        await prepared.release();
        expect(new NativeTextDecoder().decode(new TextEncoder().encode('场景🌳'))).toBe('场景🌳');
    });
});
