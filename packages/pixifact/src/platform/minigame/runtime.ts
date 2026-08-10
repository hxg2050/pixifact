import type { MiniGameApi, MiniGameCanvas } from './types';

export interface MiniGameRuntime {
    canvas: MiniGameCanvas;
    context: WebGLRenderingContext | WebGL2RenderingContext;
    height: number;
    resolution: number;
    userAgent: string;
    webGLVersion: 1 | 2;
    width: number;
}

type MutableGlobal = typeof globalThis & {
    navigator?: Navigator;
    performance?: Performance;
    requestAnimationFrame?: typeof requestAnimationFrame;
    cancelAnimationFrame?: typeof cancelAnimationFrame;
};

interface MutableEventTarget {
    addEventListener?(type: string, listener: EventListenerOrEventListenerObject, options?: unknown): void;
    removeEventListener?(type: string, listener: EventListenerOrEventListenerObject, options?: unknown): void;
    dispatchEvent?(event: Event): boolean;
}

interface MutableDocument extends MutableEventTarget {
    createElement?(tagName: string): unknown;
}

export class MiniGamePointerEvent {
    altKey = false;
    bubbles = true;
    button = 0;
    buttons = 0;
    cancelBubble = false;
    cancelable = true;
    clientX = 0;
    clientY = 0;
    ctrlKey = false;
    defaultPrevented = false;
    height = 1;
    isPrimary = false;
    isTrusted = false;
    metaKey = false;
    movementX = 0;
    movementY = 0;
    pageX = 0;
    pageY = 0;
    pointerId = 0;
    pointerType = '';
    pressure = 0;
    relatedTarget: EventTarget | null = null;
    shiftKey = false;
    srcElement: EventTarget | null = null;
    tangentialPressure = 0;
    target: EventTarget | null = null;
    tiltX = 0;
    tiltY = 0;
    twist = 0;
    type: string;
    width = 1;

    constructor(type: string, init: PointerEventInit = {}) {
        this.type = type;
        Object.assign(this, init);
        this.pageX = this.clientX;
        this.pageY = this.clientY;
    }

    composedPath(): EventTarget[] {
        return this.target ? [this.target] : [];
    }

    preventDefault() {
        this.defaultPrevented = true;
    }

    stopImmediatePropagation() {
        this.cancelBubble = true;
    }

    stopPropagation() {
        this.cancelBubble = true;
    }
}

function installEventTarget(target: MutableEventTarget, nativeTypes: Set<string> = new Set()) {
    const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
    const nativeAdd = target.addEventListener?.bind(target);
    const nativeRemove = target.removeEventListener?.bind(target);
    target.addEventListener = (type, listener, options) => {
        const typeListeners = listeners.get(type) ?? new Set();
        typeListeners.add(listener);
        listeners.set(type, typeListeners);
        if (nativeTypes.has(type)) {
            nativeAdd?.(type, listener, options);
        }
    };
    target.removeEventListener = (type, listener, options) => {
        listeners.get(type)?.delete(listener);
        if (nativeTypes.has(type)) {
            nativeRemove?.(type, listener, options);
        }
    };
    target.dispatchEvent = (event) => {
        const mutableEvent = event as Event & {
            cancelBubble?: boolean;
            srcElement?: EventTarget | null;
            target?: EventTarget | null;
        };
        mutableEvent.target ??= target as EventTarget;
        mutableEvent.srcElement ??= mutableEvent.target;
        for (const listener of listeners.get(event.type) ?? []) {
            if (typeof listener === 'function') {
                listener.call(target, event);
            } else {
                listener.handleEvent(event);
            }
            if (mutableEvent.cancelBubble) {
                break;
            }
        }
        return !event.defaultPrevented;
    };
}

function installCanvasSurface(canvas: MiniGameCanvas, width: number, height: number) {
    installEventTarget(canvas, new Set(['webglcontextlost', 'webglcontextrestored']));
    canvas.style ??= {};
    Object.defineProperty(canvas, 'isConnected', { configurable: true, value: true });
    Object.defineProperty(canvas, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
            bottom: height,
            height,
            left: 0,
            right: width,
            top: 0,
            width,
            x: 0,
            y: 0,
        }),
    });
}

function createDocumentElement(api: MiniGameApi, tagName: string): unknown {
    if (tagName.toLowerCase() === 'canvas') {
        const canvas = api.createOffscreenCanvas?.({ type: '2d', width: 1, height: 1 }) ?? api.createCanvas();
        canvas.width = 1;
        canvas.height = 1;
        return canvas;
    }
    if (tagName.toLowerCase() === 'video') {
        return { canPlayType: () => '' };
    }
    return {};
}

function installGlobals(api: MiniGameApi, canvas: MiniGameCanvas, userAgent: string) {
    const globals = globalThis as MutableGlobal;
    const mutableGlobals = globals as unknown as MutableEventTarget & Record<string, unknown>;
    installEventTarget(mutableGlobals);
    const documentTarget = (globals.document ?? {}) as unknown as MutableDocument;
    installEventTarget(documentTarget);
    documentTarget.createElement ??= (tagName) => createDocumentElement(api, tagName);
    if (!globals.document) {
        Object.defineProperty(globals, 'document', { configurable: true, value: documentTarget });
    }
    if (!globals.PointerEvent) {
        Object.defineProperty(globals, 'PointerEvent', { configurable: true, value: MiniGamePointerEvent });
    }
    if (!globals.navigator) {
        Object.defineProperty(globals, 'navigator', {
            configurable: true,
            value: { gpu: null, userAgent },
        });
    }
    if (!globals.performance) {
        Object.defineProperty(globals, 'performance', {
            configurable: true,
            value: { now: () => Date.now() },
        });
    }
    globals.requestAnimationFrame ??= canvas.requestAnimationFrame
        ? canvas.requestAnimationFrame.bind(canvas)
        : (callback) => setTimeout(() => callback(performance.now()), 16) as unknown as number;
    globals.cancelAnimationFrame ??= canvas.cancelAnimationFrame
        ? canvas.cancelAnimationFrame.bind(canvas)
        : (requestId) => clearTimeout(requestId);
}

function createContext(canvas: MiniGameCanvas) {
    const attributes = {
        alpha: false,
        antialias: true,
        powerPreference: 'high-performance',
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        stencil: true,
    };
    const webGL2 = canvas.getContext('webgl2', attributes) as WebGL2RenderingContext | null;
    if (webGL2) {
        return { context: webGL2, webGLVersion: 2 as const };
    }
    const webGL1 = canvas.getContext('webgl', attributes) as WebGLRenderingContext | null;
    if (webGL1) {
        return { context: webGL1, webGLVersion: 1 as const };
    }
    throw new Error('The current Mini Game runtime does not provide WebGL.');
}

export function createMiniGameRuntime(api: MiniGameApi, userAgent: string): MiniGameRuntime {
    const canvas = api.createCanvas();
    const info = {
        ...(api.getSystemInfoSync?.() ?? {}),
        ...(api.getDeviceInfo?.() ?? {}),
        ...(api.getWindowInfo?.() ?? {}),
    } as Record<string, unknown>;
    const width = Math.max(1, Math.round(Number(info.windowWidth ?? info.screenWidth)));
    const height = Math.max(1, Math.round(Number(info.windowHeight ?? info.screenHeight)));
    const resolution = Math.min(2, Math.max(1, Number(info.pixelRatio ?? 1)));
    installCanvasSurface(canvas, width, height);
    installGlobals(api, canvas, userAgent);
    const { context, webGLVersion } = createContext(canvas);
    return { canvas, context, height, resolution, userAgent, webGLVersion, width };
}
