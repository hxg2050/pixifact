import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    createMiniGameApplication: vi.fn(async () => ({ platform: 'douyin' })),
    installDouyinImageAssets: vi.fn(),
}));

vi.mock('pixifact/internal/minigame', async (importOriginal) => ({
    ...await importOriginal<typeof import('../packages/pixifact/src/platform/minigame')>(),
    createMiniGameApplication: mocks.createMiniGameApplication,
}));
vi.mock('../packages/platform-douyin/src/imageAssets', () => ({
    installDouyinImageAssets: mocks.installDouyinImageAssets,
}));

import { createApplication } from '../packages/platform-douyin/src/application';
import type { DouyinMiniGameApi } from '../packages/platform-douyin/src/types';

const originalDouyinApi = (globalThis as typeof globalThis & { tt?: DouyinMiniGameApi }).tt;

afterEach(() => {
    const globals = globalThis as typeof globalThis & { tt?: DouyinMiniGameApi };
    if (originalDouyinApi) {
        globals.tt = originalDouyinApi;
    } else {
        delete globals.tt;
    }
});

describe('Douyin Application', () => {
    beforeEach(() => {
        mocks.createMiniGameApplication.mockClear();
        mocks.installDouyinImageAssets.mockClear();
    });

    it('installs the Douyin image loader when the application is created', async () => {
        const api = {} as DouyinMiniGameApi;
        (globalThis as typeof globalThis & { tt: DouyinMiniGameApi }).tt = api;

        await createApplication({ antialias: false });

        expect(mocks.installDouyinImageAssets).toHaveBeenCalledOnce();
        expect(mocks.createMiniGameApplication).toHaveBeenCalledWith(
            api,
            'DouyinMiniGame',
            expect.any(Function),
            expect.any(Function),
            { antialias: false },
        );
    });
});
