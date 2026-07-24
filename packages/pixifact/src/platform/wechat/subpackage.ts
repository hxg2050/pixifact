import { wechatApi } from './types';

const loaded = new Set<string>();
const loading = new Map<string, Promise<void>>();

export function loadWechatSubpackage(name: string): Promise<void> {
    if (loaded.has(name)) {
        return Promise.resolve();
    }
    const existing = loading.get(name);
    if (existing) {
        return existing;
    }
    const pending = new Promise<void>((resolve, reject) => {
        wechatApi().loadSubpackage({
            name,
            fail: (error) => reject(new Error(`Failed to load WeChat subpackage ${name}: ${error.errMsg}`)),
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
}
