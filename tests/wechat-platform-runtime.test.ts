import { afterEach, describe, expect, it } from 'vitest';
import { bindWechatLifecycle } from '../packages/pixifact/src/platform/wechat/lifecycle';
import type { WechatMiniGameApi } from '../packages/pixifact/src/platform/wechat/types';

const originalWechatApi = (globalThis as typeof globalThis & { wx?: WechatMiniGameApi }).wx;

afterEach(() => {
    const globals = globalThis as typeof globalThis & { wx?: WechatMiniGameApi };
    if (originalWechatApi) {
        globals.wx = originalWechatApi;
    } else {
        delete globals.wx;
    }
});

function installLifecycleApi() {
    let hide: (() => void) | undefined;
    let show: (() => void) | undefined;
    const api = {
        onHide(callback: () => void) {
            hide = callback;
        },
        offHide(callback: () => void) {
            if (hide === callback) {
                hide = undefined;
            }
        },
        onShow(callback: () => void) {
            show = callback;
        },
        offShow(callback: () => void) {
            if (show === callback) {
                show = undefined;
            }
        },
    } as unknown as WechatMiniGameApi;
    (globalThis as typeof globalThis & { wx: WechatMiniGameApi }).wx = api;
    return {
        hide: () => hide?.(),
        show: () => show?.(),
    };
}

describe('WeChat platform runtime', () => {
    it('resumes a running ticker after the game returns to the foreground', () => {
        const lifecycle = installLifecycleApi();
        const target = {
            started: true,
            start() {
                this.started = true;
            },
            stop() {
                this.started = false;
            },
        };
        const binding = bindWechatLifecycle(target);

        lifecycle.hide();
        expect(binding.hidden).toBe(true);
        expect(target.started).toBe(false);

        lifecycle.show();
        expect(binding.hidden).toBe(false);
        expect(target.started).toBe(true);
        binding.dispose();
    });

    it('keeps a manually stopped ticker stopped across hide and show', () => {
        const lifecycle = installLifecycleApi();
        let starts = 0;
        const target = {
            started: false,
            start() {
                starts += 1;
                this.started = true;
            },
            stop() {
                this.started = false;
            },
        };
        const binding = bindWechatLifecycle(target);

        lifecycle.hide();
        lifecycle.show();

        expect(starts).toBe(0);
        expect(target.started).toBe(false);
        binding.dispose();
    });
});
