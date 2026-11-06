import type { MiniGameApi } from './types';

const subpackageStates = new WeakMap<MiniGameApi, {
    loaded: Set<string>;
    loading: Map<string, Promise<void>>;
}>();

export function miniGameResourceSubpackage(input: RequestInfo | URL) {
    const url = typeof input === 'string' ? input : ((input as { url?: string }).url ?? String(input));
    if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(url)) return undefined;
    const path = url.replace(/[?#].*$/, '').replace(/^\.?\//, '');
    return path.match(/^subpackages\/([^/]+)\//)?.[1];
}

export function createMiniGameSubpackageLoader(apiOrFactory: MiniGameApi | (() => MiniGameApi), platformName: string) {
    const getApi = typeof apiOrFactory === 'function' ? apiOrFactory : () => apiOrFactory;

    return function loadSubpackage(name: string): Promise<void> {
        const api = getApi();
        let state = subpackageStates.get(api);
        if (!state) {
            state = { loaded: new Set(), loading: new Map() };
            subpackageStates.set(api, state);
        }
        const { loaded, loading } = state;
        if (loaded.has(name)) {
            return Promise.resolve();
        }
        const existing = loading.get(name);
        if (existing) {
            return existing;
        }
        const pending = new Promise<void>((resolve, reject) => {
            api.loadSubpackage({
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
