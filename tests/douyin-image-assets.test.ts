import { afterEach, describe, expect, it } from 'vitest';
import { Assets, type Texture } from 'pixi.js';
import { installDouyinImageAssets } from '../packages/platform-douyin/src/imageAssets';
import type { DouyinImage, DouyinMiniGameApi } from '../packages/platform-douyin/src/types';

const originalDouyinApi = (globalThis as typeof globalThis & { tt?: DouyinMiniGameApi }).tt;

interface ControlledImage extends DouyinImage {
    emitError(error: unknown): void;
    emitLoad(): void;
}

afterEach(() => {
    Assets.reset();
    const globals = globalThis as typeof globalThis & { tt?: DouyinMiniGameApi };
    if (originalDouyinApi) {
        globals.tt = originalDouyinApi;
    } else {
        delete globals.tt;
    }
});

function installImageApi(image: ControlledImage) {
    const api = {
        createImage: () => image,
    } as unknown as DouyinMiniGameApi;
    (globalThis as typeof globalThis & { tt: DouyinMiniGameApi }).tt = api;
}

function createControlledImage(
    initialSize: { width: number; height: number },
    assignments: string[],
): { image: ControlledImage; sourceAssigned: Promise<void> } {
    let source = '';
    let notifySourceAssigned!: () => void;
    const sourceAssigned = new Promise<void>((resolve) => {
        notifySourceAssigned = resolve;
    });
    const image = {
        get complete() {
            assignments.push('complete-read');
            return true;
        },
        height: initialSize.height,
        onerror: null,
        onload: null,
        width: initialSize.width,
        get src() {
            return source;
        },
        set src(value: string) {
            assignments.push(image.onload && image.onerror ? 'handlers-before-src' : 'src-before-handlers');
            source = value;
            notifySourceAssigned();
        },
        emitLoad() {
            image.onload?.();
        },
        emitError(error: unknown) {
            image.onerror?.(error);
        },
    } satisfies ControlledImage;
    return { image, sourceAssigned };
}

describe('Douyin image assets', () => {
    it('waits for load even when complete is true and creates an explicitly sized texture', async () => {
        const assignments: string[] = [];
        const { image, sourceAssigned } = createControlledImage({ width: 320, height: 180 }, assignments);
        installImageApi(image);
        installDouyinImageAssets();
        await Assets.init({ skipDetections: true });

        let settled = false;
        const loading = Assets.load<Texture>('assets/cold-start.png').then((texture) => {
            settled = true;
            return texture;
        });
        await sourceAssigned;

        expect(settled).toBe(false);
        expect(assignments).toEqual(['handlers-before-src']);

        image.emitLoad();
        const texture = await loading;

        expect(texture.source.resource).toBe(image);
        expect(texture.source.pixelWidth).toBe(320);
        expect(texture.source.pixelHeight).toBe(180);
    });

    it('rejects images without usable dimensions and reports the URL', async () => {
        const { image, sourceAssigned } = createControlledImage({ width: 0, height: 0 }, []);
        installImageApi(image);
        installDouyinImageAssets();
        await Assets.init({ skipDetections: true });

        const loading = Assets.load<Texture>('assets/invalid-size.png');
        await sourceAssigned;
        image.emitLoad();

        await expect(loading).rejects.toThrow('assets/invalid-size.png');
    });

    it('reports the URL when the platform emits an image error', async () => {
        const { image, sourceAssigned } = createControlledImage({ width: 320, height: 180 }, []);
        installImageApi(image);
        installDouyinImageAssets();
        await Assets.init({ skipDetections: true });

        const loading = Assets.load<Texture>('assets/missing.png');
        await sourceAssigned;
        image.emitError(new Error('native image failure'));

        await expect(loading).rejects.toThrow('assets/missing.png');
    });
});
