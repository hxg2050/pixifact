import { Assets, type Texture } from 'pixi.js';

export interface SceneAssetLocation {
    src: string;
    pack?: string;
}

export type SceneAssetManifest = Record<string, SceneAssetLocation>;

export interface SceneAssetRuntimeOptions {
    loadPack?: (name: string) => Promise<void>;
}

let assetManifest: SceneAssetManifest = {};
let loadPack: SceneAssetRuntimeOptions['loadPack'];
const loadedPacks = new Set<string>();
const loadingPacks = new Map<string, Promise<void>>();

export function configureSceneAssets(manifest: SceneAssetManifest, options: SceneAssetRuntimeOptions = {}) {
    assetManifest = manifest;
    loadPack = options.loadPack;
    loadedPacks.clear();
    loadingPacks.clear();
}

async function preparePack(name: string) {
    if (loadedPacks.has(name)) {
        return;
    }
    const existing = loadingPacks.get(name);
    if (existing) {
        return existing;
    }
    if (!loadPack) {
        throw new Error(`Scene asset pack "${name}" has no platform loader.`);
    }
    const pending = loadPack(name).then(() => {
        loadedPacks.add(name);
        loadingPacks.delete(name);
    }, (error) => {
        loadingPacks.delete(name);
        throw error;
    });
    loadingPacks.set(name, pending);
    return pending;
}

export async function loadSceneTexture(id: string): Promise<Texture> {
    const location = assetManifest[id];
    if (!location) {
        throw new Error(`Scene asset "${id}" is missing from the target manifest.`);
    }
    if (location.pack) {
        await preparePack(location.pack);
    }
    Assets.add({ alias: id, src: location.src });
    return Assets.load<Texture>(id);
}
