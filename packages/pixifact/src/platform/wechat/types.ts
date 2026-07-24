export interface WechatCanvas {
    width: number;
    height: number;
    isConnected?: boolean;
    style?: Record<string, string>;
    getContext(contextId: string, options?: Record<string, unknown>): unknown;
    getBoundingClientRect?(): {
        bottom: number;
        height: number;
        left: number;
        right: number;
        top: number;
        width: number;
        x: number;
        y: number;
    };
    requestAnimationFrame?(callback: FrameRequestCallback): number;
    cancelAnimationFrame?(requestId: number): void;
    addEventListener?(type: string, listener: EventListenerOrEventListenerObject, options?: unknown): void;
    removeEventListener?(type: string, listener: EventListenerOrEventListenerObject, options?: unknown): void;
    dispatchEvent?(event: Event): boolean;
}

export interface WechatImage {
    width: number;
    height: number;
    complete?: boolean;
    crossOrigin?: string | null;
    src: string;
    onload: (() => void) | null;
    onerror: ((error: unknown) => void) | null;
}

export interface WechatTouch {
    clientX?: number;
    clientY?: number;
    force?: number;
    identifier?: number;
    pageX?: number;
    pageY?: number;
    x?: number;
    y?: number;
}

export interface WechatTouchEvent {
    changedTouches?: WechatTouch[];
    touches?: WechatTouch[];
}

export interface WechatMiniGameApi {
    createCanvas(): WechatCanvas;
    createImage(): WechatImage;
    createOffscreenCanvas?(options: {
        type: '2d' | 'webgl';
        width: number;
        height: number;
    }): WechatCanvas;
    getDeviceInfo?(): Record<string, unknown>;
    getFileSystemManager(): {
        readFile(options: {
            filePath: string;
            fail(error: { errMsg: string }): void;
            success(result: { data: ArrayBuffer | string }): void;
        }): void;
    };
    getSystemInfoSync?(): Record<string, unknown>;
    getWindowInfo?(): Record<string, unknown>;
    loadSubpackage(options: {
        name: string;
        fail(error: { errMsg: string }): void;
        success(): void;
    }): {
        onProgressUpdate(callback: (progress: { progress: number }) => void): void;
    };
    request(options: {
        url: string;
        method: 'GET';
        responseType: 'arraybuffer';
        fail(error: { errMsg: string }): void;
        success(result: {
            data: ArrayBuffer | string | Record<string, unknown>;
            header: Record<string, string>;
            statusCode: number;
        }): void;
    }): void;
    onHide(callback: () => void): void;
    offHide?(callback: () => void): void;
    onShow(callback: () => void): void;
    offShow?(callback: () => void): void;
    onTouchStart(callback: (event: WechatTouchEvent) => void): void;
    offTouchStart?(callback: (event: WechatTouchEvent) => void): void;
    onTouchMove(callback: (event: WechatTouchEvent) => void): void;
    offTouchMove?(callback: (event: WechatTouchEvent) => void): void;
    onTouchEnd(callback: (event: WechatTouchEvent) => void): void;
    offTouchEnd?(callback: (event: WechatTouchEvent) => void): void;
    onTouchCancel(callback: (event: WechatTouchEvent) => void): void;
    offTouchCancel?(callback: (event: WechatTouchEvent) => void): void;
}

export function wechatApi() {
    return (globalThis as typeof globalThis & { wx: WechatMiniGameApi }).wx;
}
