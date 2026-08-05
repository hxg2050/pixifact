import {
    BitmapText,
    Container,
    Graphics,
    Sprite,
    Text,
    type Application,
    type Bounds,
} from 'pixi.js';
import {
    type RuntimeHmrRequest,
    type RuntimeHmrResponse,
    type RuntimeInputRequest,
    type RuntimeJsonValue,
    type RuntimeLogEntry,
    type RuntimeLogLevel,
    type RuntimePageDescriptor,
    type RuntimeRequest,
} from './protocol';

const maxRetainedLogs = 500;
const runtimeRequestEvent = 'pixifact:runtime:request';
const runtimeResponseEvent = 'pixifact:runtime:response';
const runtimeAnnounceEvent = 'pixifact:runtime:announce';

type RuntimeApplication = Pick<Application, 'canvas' | 'screen' | 'stage'>;

export interface RegisterPixiRuntimeOptions {
    getState?: () => RuntimeJsonValue;
}

export interface PixifactRuntimeHotContext {
    on(event: string, listener: (data: unknown) => void): void;
    send(event: string, data: unknown): void;
}

interface RuntimeClientOptions {
    runtimeId: string;
    hot: PixifactRuntimeHotContext;
    console: Console;
    window: Window;
    now?: () => Date;
}

interface RuntimeLogCapture {
    entries(): readonly RuntimeLogEntry[];
    latestSeq(): number;
    dispose(): void;
}

type BoundsSnapshot = {
    x: number;
    y: number;
    width: number;
    height: number;
};

function pointSnapshot(point: { x: number; y: number }) {
    return { x: point.x, y: point.y };
}

function boundsSnapshot(bounds: Bounds): BoundsSnapshot {
    return {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
    };
}

function basicNodeSnapshot(node: Container, childIndex: number | null): RuntimeJsonValue {
    return {
        uid: node.uid,
        type: node.constructor.name,
        label: node.label,
        childIndex,
        position: pointSnapshot(node.position),
        scale: pointSnapshot(node.scale),
        rotation: node.rotation,
        alpha: node.alpha,
        visible: node.visible,
        renderable: node.renderable,
        zIndex: node.zIndex,
        eventMode: node.eventMode ?? null,
        children: node.children.map((child, index) => basicNodeSnapshot(child, index)),
    };
}

function supportedFill(fill: unknown): RuntimeJsonValue {
    return typeof fill === 'number' || typeof fill === 'string' ? fill : null;
}

function specificNodeSnapshot(node: Container): RuntimeJsonValue | undefined {
    if (node instanceof Sprite) {
        return {
            kind: 'sprite',
            anchor: pointSnapshot(node.anchor),
            texture: {
                uid: node.texture.uid,
                label: node.texture.label ?? null,
                width: node.texture.width,
                height: node.texture.height,
            },
            tint: node.tint,
        };
    }
    if (node instanceof BitmapText || node instanceof Text) {
        return {
            kind: node instanceof BitmapText ? 'bitmapText' : 'text',
            text: node.text,
            anchor: pointSnapshot(node.anchor),
            style: {
                align: node.style.align,
                fill: supportedFill(node.style.fill),
                fontFamily: Array.isArray(node.style.fontFamily)
                    ? [...node.style.fontFamily]
                    : node.style.fontFamily,
                fontSize: node.style.fontSize,
                fontStyle: node.style.fontStyle,
                fontWeight: node.style.fontWeight,
            },
        };
    }
    if (node instanceof Graphics) {
        return { kind: 'graphics' };
    }
    return undefined;
}

function findStageNode(stage: Container, uid: number): Container | undefined {
    if (stage.uid === uid) return stage;
    for (const child of stage.children) {
        const result = findStageNode(child, uid);
        if (result) return result;
    }
    return undefined;
}

function detailedNodeSnapshot(node: Container) {
    const childIndex = node.parent ? node.parent.children.indexOf(node) : null;
    const specific = specificNodeSnapshot(node);
    return {
        uid: node.uid,
        type: node.constructor.name,
        label: node.label,
        parentUid: node.parent?.uid ?? null,
        childIndex,
        childCount: node.children.length,
        position: pointSnapshot(node.position),
        scale: pointSnapshot(node.scale),
        pivot: pointSnapshot(node.pivot),
        skew: pointSnapshot(node.skew),
        rotation: node.rotation,
        angle: node.angle,
        width: node.width,
        height: node.height,
        localBounds: boundsSnapshot(node.getLocalBounds()),
        globalBounds: boundsSnapshot(node.getBounds()),
        alpha: node.alpha,
        worldAlpha: node.getGlobalAlpha(),
        visible: node.visible,
        renderable: node.renderable,
        zIndex: node.zIndex,
        tint: node.tint,
        blendMode: String(node.blendMode),
        eventMode: node.eventMode ?? null,
        cursor: node.cursor === undefined ? null : String(node.cursor),
        ...(specific ? { specific } : {}),
    };
}

function snapshotLogValue(
    value: unknown,
    seen: WeakSet<object> = new WeakSet(),
    depth = 0,
): RuntimeJsonValue {
    if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
        return value;
    }
    if (typeof value === 'bigint') return `${value}n`;
    if (typeof value === 'undefined') return '[undefined]';
    if (typeof value === 'symbol') return String(value);
    if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
    if (value instanceof Error) {
        return {
            name: value.name,
            message: value.message,
            stack: value.stack ?? '',
        };
    }
    if (value instanceof Date) return value.toISOString();
    if (depth >= 4) return `[${value.constructor?.name ?? 'Object'}]`;
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    if (Array.isArray(value)) {
        return value.map((item) => snapshotLogValue(item, seen, depth + 1));
    }
    const snapshot: Record<string, RuntimeJsonValue> = {};
    for (const key of Object.keys(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        snapshot[key] = descriptor && 'value' in descriptor
            ? snapshotLogValue(descriptor.value, seen, depth + 1)
            : '[Getter]';
    }
    return snapshot;
}

function logMessage(args: unknown[]) {
    const first = args[0];
    if (typeof first === 'string') return first;
    if (first instanceof Error) return first.message;
    return JSON.stringify(snapshotLogValue(first));
}

function createRuntimeLogCapture(
    targetConsole: Console,
    targetWindow: Window,
    now: () => Date,
): RuntimeLogCapture {
    const retained: RuntimeLogEntry[] = [];
    const originals = new Map<RuntimeLogLevel, (...args: unknown[]) => void>();
    let sequence = 0;

    function append(level: RuntimeLogLevel, args: unknown[], explicitStack?: string) {
        const stack = explicitStack ?? args.find((value): value is Error => value instanceof Error)?.stack;
        retained.push({
            seq: ++sequence,
            time: now().toISOString(),
            level,
            message: logMessage(args),
            args: args.slice(typeof args[0] === 'string' ? 1 : 0).map((value) => snapshotLogValue(value)),
            ...(stack ? { stack } : {}),
        });
        if (retained.length > maxRetainedLogs) retained.splice(0, retained.length - maxRetainedLogs);
    }

    for (const level of ['debug', 'log', 'info', 'warn', 'error'] as const) {
        const original = targetConsole[level] as (...args: unknown[]) => void;
        originals.set(level, original);
        targetConsole[level] = ((...args: unknown[]) => {
            original.apply(targetConsole, args);
            append(level, args);
        }) as Console[typeof level];
    }

    const onWindowError = (event: ErrorEvent) => {
        append('error', [event.message, event.error ?? null], event.error instanceof Error ? event.error.stack : undefined);
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
        const reason = event.reason as unknown;
        append('error', ['Unhandled promise rejection', reason], reason instanceof Error ? reason.stack : undefined);
    };
    targetWindow.addEventListener('error', onWindowError);
    targetWindow.addEventListener('unhandledrejection', onUnhandledRejection);

    return {
        entries: () => retained,
        latestSeq: () => sequence,
        dispose() {
            for (const [level, original] of originals) {
                targetConsole[level] = original as Console[typeof level];
            }
            targetWindow.removeEventListener('error', onWindowError);
            targetWindow.removeEventListener('unhandledrejection', onUnhandledRejection);
        },
    };
}

function pointerEvent(
    targetWindow: Window,
    type: string,
    point: { clientX: number; clientY: number },
    buttons: number,
) {
    const eventWindow = targetWindow as Window & typeof globalThis;
    return new eventWindow.PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        button: 0,
        buttons,
        ...point,
    });
}

function clientPoint(app: RuntimeApplication, x: number, y: number) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new Error('Runtime pointer coordinates must be finite numbers.');
    }
    if (x < 0 || y < 0 || x > app.screen.width || y > app.screen.height) {
        throw new Error(`Runtime pointer coordinates must stay inside ${app.screen.width} x ${app.screen.height}.`);
    }
    const bounds = app.canvas.getBoundingClientRect();
    return {
        clientX: bounds.left + (x / app.screen.width) * bounds.width,
        clientY: bounds.top + (y / app.screen.height) * bounds.height,
    };
}

function keyboardIdentity(key: string) {
    if (key === 'Space') return { key: ' ', code: 'Space' };
    if (/^Key[A-Z]$/.test(key)) return { key: key.slice(3).toLowerCase(), code: key };
    if (/^Digit[0-9]$/.test(key)) return { key: key.slice(5), code: key };
    return { key, code: key };
}

function dispatchRuntimeInput(targetWindow: Window, app: RuntimeApplication, request: RuntimeInputRequest) {
    const eventWindow = targetWindow as Window & typeof globalThis;
    if (request.action === 'move' || request.action === 'click') {
        const point = clientPoint(app, request.x, request.y);
        app.canvas.dispatchEvent(pointerEvent(targetWindow, 'pointermove', point, 0));
        if (request.action === 'click') {
            app.canvas.dispatchEvent(pointerEvent(targetWindow, 'pointerdown', point, 1));
            app.canvas.dispatchEvent(pointerEvent(targetWindow, 'pointerup', point, 0));
            app.canvas.dispatchEvent(new eventWindow.MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                button: 0,
                ...point,
            }));
        }
        return;
    }
    if (!('key' in request)) throw new Error('Runtime keyboard input requires a key.');
    const identity = keyboardIdentity(request.key);
    const dispatchKey = (type: 'keydown' | 'keyup') => {
        targetWindow.dispatchEvent(new eventWindow.KeyboardEvent(type, {
            bubbles: true,
            cancelable: true,
            ...identity,
        }));
    };
    if (request.action === 'key' || request.action === 'keydown') dispatchKey('keydown');
    if (request.action === 'key' || request.action === 'keyup') dispatchKey('keyup');
}

function cloneState(value: RuntimeJsonValue) {
    return JSON.parse(JSON.stringify(value)) as RuntimeJsonValue;
}

function isHmrRequest(value: unknown): value is RuntimeHmrRequest {
    return typeof value === 'object'
        && value !== null
        && typeof (value as RuntimeHmrRequest).requestId === 'string'
        && typeof (value as RuntimeHmrRequest).runtimeId === 'string'
        && typeof (value as RuntimeHmrRequest).request === 'object'
        && (value as RuntimeHmrRequest).request !== null;
}

export function createPixifactRuntimeClient(options: RuntimeClientOptions) {
    const now = options.now ?? (() => new Date());
    const logs = createRuntimeLogCapture(options.console, options.window, now);
    let app: RuntimeApplication | undefined;
    let getState: (() => RuntimeJsonValue) | undefined;

    function descriptor(): RuntimePageDescriptor {
        return {
            runtimeId: options.runtimeId,
            url: options.window.location.href,
            title: options.window.document.title,
            ready: app !== undefined,
        };
    }

    function announce() {
        options.hot.send(runtimeAnnounceEvent, descriptor());
    }

    function requireApplication() {
        if (!app) throw new Error('PixiJS Application has not been registered in this runtime.');
        return app;
    }

    async function handleRequest(request: RuntimeRequest): Promise<RuntimeJsonValue> {
        if (request.type === 'logs') {
            return {
                runtimeId: options.runtimeId,
                latestSeq: logs.latestSeq(),
                entries: logs.entries()
                    .filter((entry) => request.after === undefined || entry.seq > request.after)
                    .filter((entry) => request.level === undefined || entry.level === request.level)
                    .map((entry) => ({ ...entry })),
            };
        }

        const currentApp = requireApplication();
        if (request.type === 'tree') {
            return {
                runtimeId: options.runtimeId,
                root: basicNodeSnapshot(currentApp.stage, null),
            };
        }
        if (request.type === 'node') {
            const node = findStageNode(currentApp.stage, request.uid);
            if (!node) throw new Error(`PixiJS node uid ${request.uid} is not in app.stage.`);
            return {
                runtimeId: options.runtimeId,
                node: detailedNodeSnapshot(node),
            };
        }
        if (request.type === 'state') {
            return getState
                ? {
                    runtimeId: options.runtimeId,
                    available: true,
                    state: cloneState(getState()),
                }
                : {
                    runtimeId: options.runtimeId,
                    available: false,
                    state: null,
                };
        }
        if (request.type === 'input') {
            dispatchRuntimeInput(options.window, currentApp, request);
            return {
                runtimeId: options.runtimeId,
                dispatched: true,
            };
        }
        throw new Error('Unknown Pixifact Runtime request.');
    }

    options.hot.on(runtimeRequestEvent, (data) => {
        if (!isHmrRequest(data) || data.runtimeId !== options.runtimeId) return;
        void handleRequest(data.request).then(
            (result) => options.hot.send(runtimeResponseEvent, {
                requestId: data.requestId,
                runtimeId: options.runtimeId,
                ok: true,
                result,
            } satisfies RuntimeHmrResponse),
            (error: unknown) => options.hot.send(runtimeResponseEvent, {
                requestId: data.requestId,
                runtimeId: options.runtimeId,
                ok: false,
                error: error instanceof Error ? error.message : String(error),
            } satisfies RuntimeHmrResponse),
        );
    });
    announce();

    return {
        register(application: Application, registerOptions: RegisterPixiRuntimeOptions = {}) {
            if (app) throw new Error('This page already has a registered PixiJS Application.');
            app = application;
            getState = registerOptions.getState;
            announce();
        },
        handleRequest,
        dispose: logs.dispose,
    };
}
