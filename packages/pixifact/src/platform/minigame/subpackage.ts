import type { MiniGameApi } from './types';

export function miniGameResourceSubpackage(input: RequestInfo | URL) {
    const url = typeof input === 'string' ? input : ((input as { url?: string }).url ?? String(input));
    if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(url)) return undefined;
    const path = url.replace(/[?#].*$/, '').replace(/^\.?\//, '');
    return path.match(/^subpackages\/([^/]+)\//)?.[1];
}

export function createMiniGameSubpackageLoader(apiOrFactory: MiniGameApi | (() => MiniGameApi), platformName: string) {
    const getApi = typeof apiOrFactory === 'function' ? apiOrFactory : () => apiOrFactory;
    const loaded = new Set<string>();
    const loading = new Map<string, Promise<void>>();

    return function loadSubpackage(name: string): Promise<void> {
        if (loaded.has(name)) {
            return Promise.resolve();
        }
        const existing = loading.get(name);
        if (existing) {
            return existing;
        }
        const pending = new Promise<void>((resolve, reject) => {
            getApi().loadSubpackage({
                name,
                fail: (error) => reject(new Error(`Failed to load ${platformName} subpackage ${name}: ${error.errMsg}`)),
                success: resolve,
            });
        }).then(() => {
            loaded.add(name);
            loading.delete(name);
        }, (error) => {
            loading.delete(name);
            throw error;
        });
        loading.set(name, pending);
        return pending;
    };
}
