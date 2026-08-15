import { afterEach, describe, expect, it, vi } from 'vitest';
import { Bounds, Container, Rectangle, Sprite, Text, Texture, type Application } from 'pixi.js';
import {
    createPixifactRuntimeClient,
    type PixifactRuntimeHotContext,
} from '../packages/pixifact/src/runtime-dev/runtimeClient';

interface FakeHotContext extends PixifactRuntimeHotContext {
    emit(event: string, data: unknown): void;
    send: ReturnType<typeof vi.fn>;
}

function createHotContext(): FakeHotContext {
    const listeners = new Map<string, Array<(data: unknown) => void>>();
    return {
        on(event, listener) {
            const current = listeners.get(event) ?? [];
            current.push(listener);
            listeners.set(event, current);
        },
        send: vi.fn(),
        emit(event, data) {
            for (const listener of listeners.get(event) ?? []) listener(data);
        },
    };
}

function createConsole() {
    return {
        debug: vi.fn(),
        log: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    } as unknown as Console;
}

function createApplication(
    stage = new Container(),
    renderer = {
        background: { colorRgba: [0.03, 0.04, 0.05, 1] },
        extract: { base64: vi.fn(async () => 'data:image/png;base64,iVBORw0KGgo=') },
    },
) {
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'getBoundingClientRect', {
        value: () => ({
            x: 10,
            y: 20,
            left: 10,
            top: 20,
            right: 385,
            bottom: 687,
            width: 375,
            height: 667,
            toJSON() {},
        }),
    });
    return {
        stage,
        canvas,
        screen: { width: 750, height: 1334 },
        renderer,
    } as unknown as Application;
}

const disposals: Array<() => void> = [];

afterEach(() => {
    for (const dispose of disposals.splice(0)) dispose();
});

function createClient() {
    const hot = createHotContext();
    const runtimeConsole = createConsole();
    const consoleSpies = {
        info: runtimeConsole.info,
        error: runtimeConsole.error,
    };
    const client = createPixifactRuntimeClient({
        runtimeId: 'runtime-test',
        hot,
        console: runtimeConsole,
        window,
        now: () => new Date('2026-08-05T10:21:32.415Z'),
    });
    disposals.push(client.dispose);
    return { client, consoleSpies, hot, runtimeConsole };
}

describe('Pixifact Runtime client', () => {
    it('reuses the injected client when the runtime-dev module is evaluated again', async () => {
        const runtimeHotKey = Symbol.for('pixifact.runtime.hot');
        const runtimeClientKey = Symbol.for('pixifact.runtime.client');
        const runtimeGlobal = globalThis as { [key: symbol]: unknown };
        const hot = createHotContext();
        runtimeGlobal[runtimeHotKey] = hot;

        try {
            const initialModule = await import('../packages/pixifact/src/runtime-dev/index');
            initialModule.registerPixiRuntime(createApplication());
            delete runtimeGlobal[runtimeHotKey];

            vi.resetModules();
            const reloadedModule = await import('../packages/pixifact/src/runtime-dev/index');
            expect(() => reloadedModule.registerPixiRuntime(createApplication()))
                .toThrow('This page already has a registered PixiJS Application.');

            const announcements = hot.send.mock.calls
                .filter(([event]) => event === 'pixifact:runtime:announce')
                .map(([, descriptor]) => descriptor as { runtimeId: string });
            expect(announcements).toHaveLength(2);
            expect(announcements[1].runtimeId).toBe(announcements[0].runtimeId);
        } finally {
            (runtimeGlobal[runtimeClientKey] as { dispose(): void } | undefined)?.dispose();
            delete runtimeGlobal[runtimeClientKey];
            delete runtimeGlobal[runtimeHotKey];
            vi.resetModules();
        }
    });

    it('reads the live PixiJS stage tree in original child order', async () => {
        const stage = new Container({ label: 'stage' });
        const world = new Container({
            label: 'world',
            x: 12,
            y: 24,
            scale: { x: 2, y: 3 },
            rotation: 0.25,
            alpha: 0.8,
            visible: true,
            renderable: true,
            zIndex: 4,
            eventMode: 'passive',
        });
        const first = new Container({ label: 'first' });
        const second = new Container({ label: 'second' });
        world.addChild(first, second);
        stage.addChild(world);
        const { client } = createClient();
        client.register(createApplication(stage));

        const initial = await client.handleRequest({ type: 'tree' });

        expect(initial).toEqual({
            runtimeId: 'runtime-test',
            root: expect.objectContaining({
                uid: stage.uid,
                type: 'Container',
                label: 'stage',
                childIndex: null,
                children: [expect.objectContaining({
                    uid: world.uid,
                    label: 'world',
                    childIndex: 0,
                    position: { x: 12, y: 24 },
                    scale: { x: 2, y: 3 },
                    rotation: 0.25,
                    alpha: 0.8,
                    visible: true,
                    renderable: true,
                    zIndex: 4,
                    eventMode: 'passive',
                    children: [
                        expect.objectContaining({ uid: first.uid, childIndex: 0 }),
                        expect.objectContaining({ uid: second.uid, childIndex: 1 }),
                    ],
                })],
            }),
        });

        world.removeChild(first);
        const dynamic = await client.handleRequest({ type: 'tree' });

        expect(dynamic.root.children[0].children).toEqual([
            expect.objectContaining({ uid: second.uid, childIndex: 0 }),
        ]);
    });

    it('returns detailed current node fields and supported type-specific data by Pixi uid', async () => {
        const stage = new Container();
        const sprite = new Sprite({ texture: Texture.EMPTY, label: 'hero', anchor: 0.5 });
        sprite.position.set(30, 40);
        sprite.tint = 0x336699;
        sprite.eventMode = 'static';
        sprite.cursor = 'pointer';
        const text = new Text({
            text: 'Ready',
            label: 'status',
            style: {
                fontFamily: 'Arial',
                fontSize: 20,
                fontWeight: 'bold',
                fill: 0xffcc00,
                align: 'center',
            },
        });
        const textBounds = new Bounds();
        textBounds.addFrame(0, 0, 60, 24);
        Object.defineProperties(text, {
            width: { configurable: true, value: 60 },
            height: { configurable: true, value: 24 },
        });
        text.getLocalBounds = vi.fn(() => textBounds);
        text.getBounds = vi.fn(() => textBounds);
        stage.addChild(sprite, text);
        const { client } = createClient();
        client.register(createApplication(stage));

        const spriteResult = await client.handleRequest({ type: 'node', uid: sprite.uid });
        const textResult = await client.handleRequest({ type: 'node', uid: text.uid });

        expect(spriteResult).toEqual({
            runtimeId: 'runtime-test',
            node: expect.objectContaining({
                uid: sprite.uid,
                parentUid: stage.uid,
                childIndex: 0,
                childCount: 0,
                position: { x: 30, y: 40 },
                width: 1,
                height: 1,
                worldAlpha: 1,
                eventMode: 'static',
                cursor: 'pointer',
                localBounds: expect.objectContaining({ width: 1, height: 1 }),
                globalBounds: expect.objectContaining({ x: 29.5, y: 39.5, width: 1, height: 1 }),
                specific: {
                    kind: 'sprite',
                    anchor: { x: 0.5, y: 0.5 },
                    texture: {
                        uid: Texture.EMPTY.uid,
                        label: 'EMPTY',
                        width: 1,
                        height: 1,
                    },
                    tint: 0x336699,
                },
            }),
        });
        expect(textResult.node.specific).toEqual({
            kind: 'text',
            text: 'Ready',
            anchor: { x: 0, y: 0 },
            style: {
                align: 'center',
                fill: 0xffcc00,
                fontFamily: 'Arial',
                fontSize: 20,
                fontStyle: 'normal',
                fontWeight: 'bold',
            },
        });

        stage.removeChild(sprite);
        await expect(client.handleRequest({ type: 'node', uid: sprite.uid }))
            .rejects.toThrow(`PixiJS node uid ${sprite.uid} is not in app.stage.`);
    });

    it('evaluates the optional state provider only when state is requested', async () => {
        let hp = 100;
        const getState = vi.fn(() => ({ player: { hp } }));
        const { client } = createClient();
        client.register(createApplication(), { getState });

        await client.handleRequest({ type: 'tree' });
        expect(getState).not.toHaveBeenCalled();

        expect(await client.handleRequest({ type: 'state' })).toEqual({
            runtimeId: 'runtime-test',
            available: true,
            state: { player: { hp: 100 } },
        });

        hp = 75;
        expect(await client.handleRequest({ type: 'state' })).toEqual({
            runtimeId: 'runtime-test',
            available: true,
            state: { player: { hp: 75 } },
        });
        expect(getState).toHaveBeenCalledTimes(2);
    });

    it('reports unavailable state without requiring a second registration API', async () => {
        const { client } = createClient();
        client.register(createApplication());

        expect(await client.handleRequest({ type: 'state' })).toEqual({
            runtimeId: 'runtime-test',
            available: false,
            state: null,
        });
    });

    it('captures the current Pixi stage at logical screen size with the renderer background', async () => {
        const stage = new Container({ label: 'stage' });
        const base64 = vi.fn(async (options: {
            target: Container;
            frame: Rectangle;
            resolution: number;
            format: string;
            clearColor: unknown;
        }) => {
            expect(options.target).toBe(stage);
            expect(options.frame).toEqual(new Rectangle(0, 0, 750, 1334));
            expect(options.resolution).toBe(1);
            expect(options.format).toBe('png');
            expect(options.clearColor).toEqual([0.03, 0.04, 0.05, 1]);
            return 'data:image/png;base64,iVBORw0KGgo=';
        });
        const { client } = createClient();
        client.register(createApplication(stage, {
            background: { colorRgba: [0.03, 0.04, 0.05, 1] },
            extract: { base64 },
        }));

        await expect(client.handleRequest({ type: 'screenshot' })).resolves.toEqual({
            runtimeId: 'runtime-test',
            width: 750,
            height: 1334,
            dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        });
        expect(base64).toHaveBeenCalledTimes(1);
    });

    it('returns a structured HMR failure when getState cannot produce JSON', async () => {
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        const { client, hot } = createClient();
        client.register(createApplication(), {
            getState: () => circular as never,
        });
        hot.send.mockClear();

        hot.emit('pixifact:runtime:request', {
            requestId: 'request-state',
            runtimeId: 'runtime-test',
            request: { type: 'state' },
        });

        await vi.waitFor(() => {
            expect(hot.send).toHaveBeenCalledWith('pixifact:runtime:response', {
                requestId: 'request-state',
                runtimeId: 'runtime-test',
                ok: false,
                error: expect.stringContaining('circular'),
            });
        });
    });

    it('captures bounded console and error snapshots while preserving original console calls', async () => {
        const { client, consoleSpies, runtimeConsole } = createClient();
        const error = new Error('Load failed');
        runtimeConsole.info('Game ready', { phase: 'menu' });
        runtimeConsole.error('Asset failed', error);

        expect(consoleSpies.info).toHaveBeenCalledWith('Game ready', { phase: 'menu' });
        expect(consoleSpies.error).toHaveBeenCalledWith('Asset failed', error);

        const first = await client.handleRequest({ type: 'logs' });
        expect(first).toEqual({
            runtimeId: 'runtime-test',
            latestSeq: 2,
            entries: [
                {
                    seq: 1,
                    time: '2026-08-05T10:21:32.415Z',
                    level: 'info',
                    message: 'Game ready',
                    args: [{ phase: 'menu' }],
                },
                {
                    seq: 2,
                    time: '2026-08-05T10:21:32.415Z',
                    level: 'error',
                    message: 'Asset failed',
                    args: [{ name: 'Error', message: 'Load failed', stack: error.stack }],
                    stack: error.stack,
                },
            ],
        });

        expect(await client.handleRequest({ type: 'logs', after: 1, level: 'error' })).toEqual({
            runtimeId: 'runtime-test',
            latestSeq: 2,
            entries: [expect.objectContaining({ seq: 2, level: 'error' })],
        });

        for (let index = 0; index < 500; index += 1) runtimeConsole.debug('tick', index);
        const bounded = await client.handleRequest({ type: 'logs' });
        expect(bounded.latestSeq).toBe(502);
        expect(bounded.entries).toHaveLength(500);
        expect(bounded.entries[0].seq).toBe(3);
    });

    it('maps renderer coordinates to Canvas client coordinates and dispatches normal input events', async () => {
        const app = createApplication();
        const { client } = createClient();
        client.register(app);
        const pointerEvents: Array<Record<string, unknown>> = [];
        const keyboardEvents: Array<Record<string, unknown>> = [];
        for (const type of ['pointermove', 'pointerdown', 'pointerup', 'click']) {
            app.canvas.addEventListener(type, (event) => {
                const pointer = event as PointerEvent;
                pointerEvents.push({
                    type: event.type,
                    clientX: pointer.clientX,
                    clientY: pointer.clientY,
                    button: pointer.button,
                });
            });
        }
        for (const type of ['keydown', 'keyup']) {
            window.addEventListener(type, (event) => {
                const keyboard = event as KeyboardEvent;
                keyboardEvents.push({ type: event.type, key: keyboard.key, code: keyboard.code });
            }, { once: true });
        }

        expect(await client.handleRequest({ type: 'input', action: 'move', x: 300, y: 400 }))
            .toEqual({ runtimeId: 'runtime-test', dispatched: true });
        expect(await client.handleRequest({ type: 'input', action: 'click', x: 300, y: 400 }))
            .toEqual({ runtimeId: 'runtime-test', dispatched: true });
        expect(await client.handleRequest({ type: 'input', action: 'key', key: 'Space' }))
            .toEqual({ runtimeId: 'runtime-test', dispatched: true });

        expect(pointerEvents).toEqual([
            { type: 'pointermove', clientX: 160, clientY: 220, button: 0 },
            { type: 'pointermove', clientX: 160, clientY: 220, button: 0 },
            { type: 'pointerdown', clientX: 160, clientY: 220, button: 0 },
            { type: 'pointerup', clientX: 160, clientY: 220, button: 0 },
            { type: 'click', clientX: 160, clientY: 220, button: 0 },
        ]);
        expect(keyboardEvents).toEqual([
            { type: 'keydown', key: ' ', code: 'Space' },
            { type: 'keyup', key: ' ', code: 'Space' },
        ]);
    });

    it('answers matching HMR requests and ignores requests for another runtime', async () => {
        const { client, hot } = createClient();
        client.register(createApplication());
        hot.send.mockClear();

        hot.emit('pixifact:runtime:request', {
            requestId: 'request-1',
            runtimeId: 'another-runtime',
            request: { type: 'tree' },
        });
        await Promise.resolve();
        expect(hot.send).not.toHaveBeenCalled();

        hot.emit('pixifact:runtime:request', {
            requestId: 'request-2',
            runtimeId: 'runtime-test',
            request: { type: 'tree' },
        });
        await vi.waitFor(() => {
            expect(hot.send).toHaveBeenCalledWith('pixifact:runtime:response', {
                requestId: 'request-2',
                runtimeId: 'runtime-test',
                ok: true,
                result: expect.objectContaining({ runtimeId: 'runtime-test' }),
            });
        });
    });
});
