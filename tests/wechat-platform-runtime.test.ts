import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApplication } from '@pixifact/platform-wechat';
import { fetchWechatResource } from '../packages/platform-wechat/src/fetch';
import { bindWechatLifecycle } from '../packages/platform-wechat/src/lifecycle';
import type { WechatMiniGameApi } from '../packages/platform-wechat/src/types';

const originalWechatApi = (globalThis as typeof globalThis & { wx?: WechatMiniGameApi }).wx;

afterEach(() => {
    vi.unstubAllGlobals();
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
    it('can import the package without a wx global', () => {
        expect(createApplication).toBeTypeOf('function');
        expect((globalThis as typeof globalThis & { wx?: unknown }).wx).toBeUndefined();
    });

    it('reads UTF-8 JSON without TextEncoder or TextDecoder', async () => {
        const jsonText = '{"title":"微信 🎮"}';
        const encoded = new TextEncoder().encode(jsonText);
        const encodedWithBom = new Uint8Array(encoded.length + 3);
        encodedWithBom.set([0xef, 0xbb, 0xbf]);
        encodedWithBom.set(encoded, 3);
        let responseData: ArrayBuffer | string = encodedWithBom.buffer;
        const api = {
            loadSubpackage(options: { success(): void }) {
                options.success();
                return {};
            },
            getFileSystemManager: () => ({
                readFile(options: {
                    success(result: { data: ArrayBuffer | string }): void;
                }) {
                    options.success({ data: responseData });
                },
            }),
        } as unknown as WechatMiniGameApi;
        (globalThis as typeof globalThis & { wx: WechatMiniGameApi }).wx = api;
        vi.stubGlobal('TextDecoder', undefined);
        vi.stubGlobal('TextEncoder', undefined);

        const binaryResponse = await fetchWechatResource('subpackages/demo-level/level.json');
        await expect(binaryResponse.json()).resolves.toEqual({ title: '微信 🎮' });

        responseData = jsonText;
        const stringResponse = await fetchWechatResource('subpackages/demo-level/level.json');
        const buffer = await stringResponse.arrayBuffer();
        expect([...new Uint8Array(buffer)]).toEqual([...encoded]);
    });

    it('deduplicates concurrent subpackage loads and retries after failure', async () => {
        let attempts = 0;
        const api = {
            loadSubpackage(options: { fail(error: { errMsg: string }): void; success(): void }) {
                attempts += 1;
                if (attempts === 1) options.fail({ errMsg: 'temporary failure' });
                else options.success();
                return {};
            },
            getFileSystemManager: () => ({
                readFile(options: { success(result: { data: string }): void }) {
                    options.success({ data: '{"ok":true}' });
                },
            }),
        } as unknown as WechatMiniGameApi;
        (globalThis as typeof globalThis & { wx: WechatMiniGameApi }).wx = api;

        await expect(fetchWechatResource('subpackages/retry-pack/data.json')).rejects.toThrow('temporary failure');
        const responses = await Promise.all([
            fetchWechatResource('subpackages/retry-pack/data.json'),
            fetchWechatResource('subpackages/retry-pack/other.json'),
        ]);

        await expect(Promise.all(responses.map((response) => response.json()))).resolves.toEqual([
            { ok: true },
            { ok: true },
        ]);
        expect(attempts).toBe(2);
    });

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
