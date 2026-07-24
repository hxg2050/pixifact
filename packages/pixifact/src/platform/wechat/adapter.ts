import { fetchWechatResource } from './fetch';
import type { WechatRuntime } from './runtime';
import { wechatApi } from './types';

export function createWechatPixiAdapter(runtime: WechatRuntime) {
    const wx = wechatApi();
    const webGL1Constructor = globalThis.WebGLRenderingContext
        ?? (runtime.webGLVersion === 1 ? runtime.context.constructor : class WebGLRenderingContextFallback {});
    return {
        createCanvas(width = 1, height = 1) {
            const canvas = wx.createOffscreenCanvas?.({ type: '2d', width, height }) ?? wx.createCanvas();
            canvas.width = width;
            canvas.height = height;
            return canvas;
        },
        createImage: () => wx.createImage(),
        getCanvasRenderingContext2D: () => Object,
        getWebGLRenderingContext: () => webGL1Constructor,
        getNavigator: () => ({ gpu: null, userAgent: runtime.userAgent }),
        getBaseUrl: () => '',
        getFontFaceSet: () => null,
        fetch: fetchWechatResource,
        parseXML: (): Document => {
            throw new Error('XML parsing is not implemented for the WeChat target.');
        },
    };
}
