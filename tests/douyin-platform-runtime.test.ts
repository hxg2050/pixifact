import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApplication } from '@pixifact/platform-douyin';
import { fetchDouyinResource } from '../packages/platform-douyin/src/fetch';
import { bindDouyinLifecycle } from '../packages/platform-douyin/src/lifecycle';
import { bindDouyinPointerEvents } from '../packages/platform-douyin/src/input';
import type { DouyinCanvas, DouyinMiniGameApi } from '../packages/platform-douyin/src/types';

const originalDouyinApi = (globalThis as typeof globalThis & { tt?: DouyinMiniGameApi }).tt;

afterEach(() => {
    vi.unstubAllGlobals();
    const globals = globalThis as typeof globalThis & { tt?: DouyinMiniGameApi };
    if (originalDouyinApi) {
        globals.tt = originalDouyinApi;
    } else {
        delete globals.tt;
    }
});

describe('Douyin platform runtime', () => {
    it('can import the package without a tt global', () => {
        expect(createApplication).toBeTypeOf('function');
        expect((globalThis as typeof globalThis & { tt?: unknown }).tt).toBeUndefined();
    });

    it('maps screen coordinates into Pixi pointer events', () => {
        let start: ((event: { changedTouches: Array<{ identifier: number; screenX: number; screenY: number }> }) => void) | undefined;
        const api = {
            onTouchStart(callback: typeof start) {
                start = callback;
            },
            onTouchMove() {},
            onTouchEnd() {},
            onTouchCancel() {},
        } as unknown as DouyinMiniGameApi;
        (globalThis as typeof globalThis & { tt: DouyinMiniGameApi }).tt = api;
        const pointerdown = vi.fn();
        const canvas = { width: 360, height: 640 } as DouyinCanvas;

        bindDouyinPointerEvents(canvas, {
            pointerdown,
            pointermove: vi.fn(),
            pointerup: vi.fn(),
        });
        start?.({ changedTouches: [{ identifier: 7, screenX: 42, screenY: 88 }] });

        expect(pointerdown).toHaveBeenCalledWith(expect.objectContaining({
            clientX: 42,
            clientY: 88,
            pointerId: 8,
        }));
    });

    it('reads UTF-8 JSON through tt.request', async () => {
        const api = {
            request(options: { success(result: { data: ArrayBuffer; header: Record<string, string>; statusCode: number }): void }) {
                options.success({
                    data: new TextEncoder().encode('{"title":"抖音 🎮"}').buffer,
                    header: {},
                    statusCode: 200,
                });
            },
        } as unknown as DouyinMiniGameApi;
        (globalThis as typeof globalThis & { tt: DouyinMiniGameApi }).tt = api;

        await expect(fetchDouyinResource('https://cdn.example.com/level.json').then((response) => response.json()))
            .resolves.toEqual({ title: '抖音 🎮' });
    });

    it('resumes a running ticker after tt.onShow', () => {
        let hide: (() => void) | undefined;
        let show: (() => void) | undefined;
        const api = {
            onHide(callback: () => void) { hide = callback; },
            offHide() {},
            onShow(callback: () => void) { show = callback; },
            offShow() {},
        } as unknown as DouyinMiniGameApi;
        (globalThis as typeof globalThis & { tt: DouyinMiniGameApi }).tt = api;
        const target = {
            started: true,
            start() { this.started = true; },
            stop() { this.started = false; },
        };

        const binding = bindDouyinLifecycle(target);
        hide?.();
        expect(target.started).toBe(false);
        show?.();
        expect(target.started).toBe(true);
        binding.dispose();
    });
});
