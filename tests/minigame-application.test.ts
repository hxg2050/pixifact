import { describe, expect, it, vi } from 'vitest';
import type { MiniGameApi } from '../packages/pixifact/src/platform/minigame/types';

const mocks = vi.hoisted(() => {
    const runtime = {
        canvas: { height: 640, width: 360 },
        context: {},
        height: 640,
        resolution: 2,
        userAgent: 'MiniGame',
        webGLVersion: 2 as const,
        width: 360,
    };
    const input = {
        activePointerCount: 0,
        cancelAll: vi.fn(),
        dispose: vi.fn(),
    };
    const lifecycle = {
        dispose: vi.fn(),
        hidden: false,
    };
    const installAdapter = vi.fn();
    const bindInput = vi.fn(() => input);
    const bindLifecycle = vi.fn(() => lifecycle);
    const createRuntime = vi.fn(() => runtime);
    const baseDestroy = vi.fn();

    class Application {
        readonly init = vi.fn(async () => undefined);
        readonly renderer = {
            events: {
                _onPointerDown: vi.fn(),
                _onPointerMove: vi.fn(),
                _onPointerUp: vi.fn(),
            },
        };
        readonly ticker = {};

        destroy(...args: unknown[]) {
            baseDestroy(...args);
        }
    }

    return {
        Application,
        baseDestroy,
        bindInput,
        bindLifecycle,
        createRuntime,
        input,
        installAdapter,
        lifecycle,
        runtime,
    };
});

vi.mock('pixi.js', () => ({ Application: mocks.Application }));
vi.mock('pixi.js/events', () => ({}));
vi.mock('pixi.js/unsafe-eval', () => ({}));
vi.mock('../packages/pixifact/src/platform/minigame/adapter', () => ({
    installMiniGamePixiAdapter: mocks.installAdapter,
}));
vi.mock('../packages/pixifact/src/platform/minigame/input', () => ({
    bindMiniGamePointerEvents: mocks.bindInput,
}));
vi.mock('../packages/pixifact/src/platform/minigame/lifecycle', () => ({
    bindMiniGameLifecycle: mocks.bindLifecycle,
}));
vi.mock('../packages/pixifact/src/platform/minigame/runtime', () => ({
    createMiniGameRuntime: mocks.createRuntime,
}));

import { Application } from 'pixi.js';
import { createMiniGameApplication } from '../packages/pixifact/src/platform/minigame/application';

describe('Mini Game Application', () => {
    it('returns a Pixi Application, passes options through, and disposes bindings once', async () => {
        const api = {} as MiniGameApi;
        const fetchResource = vi.fn();
        const coordinates = vi.fn(() => ({ x: 0, y: 0 }));

        const app = await createMiniGameApplication(
            api,
            'MiniGame',
            fetchResource,
            coordinates,
            {
                antialias: false,
                backgroundColor: 0x123456,
                resolution: 1.5,
            },
        );

        expect(app).toBeInstanceOf(Application);
        expect(mocks.createRuntime).toHaveBeenCalledWith(api, 'MiniGame');
        expect(mocks.installAdapter).toHaveBeenCalledWith(api, mocks.runtime, fetchResource);
        expect(app.init).toHaveBeenCalledWith(expect.objectContaining({
            antialias: false,
            autoDensity: false,
            backgroundColor: 0x123456,
            canvas: mocks.runtime.canvas,
            context: mocks.runtime.context,
            height: 640,
            preference: 'webgl',
            resolution: 1.5,
            skipExtensionImports: true,
            width: 360,
        }));
        expect(mocks.bindInput).toHaveBeenCalledWith(
            api,
            mocks.runtime.canvas,
            expect.any(Object),
            coordinates,
        );
        expect(mocks.bindLifecycle).toHaveBeenCalledWith(api, app.ticker, expect.any(Object));

        app.destroy();
        app.destroy();

        expect(mocks.lifecycle.dispose).toHaveBeenCalledTimes(1);
        expect(mocks.input.dispose).toHaveBeenCalledTimes(1);
        expect(mocks.baseDestroy).toHaveBeenCalledTimes(1);
    });
});
