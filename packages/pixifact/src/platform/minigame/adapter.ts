import { DOMAdapter, loadTextures } from 'pixi.js';
import type { MiniGameApi, MiniGameFetch } from './types';
import type { MiniGameRuntime } from './runtime';

export function createMiniGamePixiAdapter(
    api: MiniGameApi,
    runtime: MiniGameRuntime,
    fetchResource: MiniGameFetch,
) {
    const webGL1Constructor = globalThis.WebGLRenderingContext
        ?? (runtime.webGLVersion === 1 ? runtime.context.constructor : class WebGLRenderingContextFallback {});
    return {
        createCanvas(width = 1, height = 1) {
            const canvas = api.createOffscreenCanvas?.({ type: '2d', width, height }) ?? api.createCanvas();
            canvas.width = width;
            canvas.height = height;
            return canvas;
        },
        createImage: () => api.createImage(),
        getCanvasRenderingContext2D: () => Object,
        getWebGLRenderingContext: () => webGL1Constructor,
        getNavigator: () => ({ gpu: null, userAgent: runtime.userAgent }),
        getBaseUrl: () => '',
        getFontFaceSet: () => null,
        fetch: fetchResource,
        parseXML: (): Document => {
            throw new Error('XML parsing is not implemented for the Mini Game target.');
        },
    };
}

export function installMiniGamePixiAdapter(
    api: MiniGameApi,
    runtime: MiniGameRuntime,
    fetchResource: MiniGameFetch,
) {
    DOMAdapter.set(createMiniGamePixiAdapter(api, runtime, fetchResource) as unknown as Parameters<typeof DOMAdapter.set>[0]);
    loadTextures.config!.preferCreateImageBitmap = false;
}
