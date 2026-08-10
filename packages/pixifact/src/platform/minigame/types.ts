export interface MiniGameCanvas {
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

export interface MiniGameImage {
    width: number;
    height: number;
    complete?: boolean;
    crossOrigin?: string | null;
    src: string;
    onload: (() => void) | null;
    onerror: ((error: unknown) => void) | null;
}

export interface MiniGameTouch {
    clientX?: number;
    clientY?: number;
    force?: number;
    identifier?: number;
    pageX?: number;
    pageY?: number;
    screenX?: number;
    screenY?: number;
    x?: number;
    y?: number;
}

export interface MiniGameTouchEvent {
    changedTouches?: MiniGameTouch[];
    touches?: MiniGameTouch[];
}

export interface MiniGameApi {
    createCanvas(): MiniGameCanvas;
    createImage(): MiniGameImage;
    createOffscreenCanvas?(options?: {
        type: '2d' | 'webgl';
        width: number;
        height: number;
    }): MiniGameCanvas;
    getDeviceInfo?(): Record<string, unknown>;
    getFileSystemManager(): {
        readFile(options: {
            encoding?: string;
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
        onProgressUpdate?(callback: (progress: { progress: number }) => void): void;
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
    onTouchStart(callback: (event: MiniGameTouchEvent) => void): void;
    offTouchStart?(callback: (event: MiniGameTouchEvent) => void): void;
    onTouchMove(callback: (event: MiniGameTouchEvent) => void): void;
    offTouchMove?(callback: (event: MiniGameTouchEvent) => void): void;
    onTouchEnd(callback: (event: MiniGameTouchEvent) => void): void;
    offTouchEnd?(callback: (event: MiniGameTouchEvent) => void): void;
    onTouchCancel(callback: (event: MiniGameTouchEvent) => void): void;
    offTouchCancel?(callback: (event: MiniGameTouchEvent) => void): void;
}

export type MiniGameFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
