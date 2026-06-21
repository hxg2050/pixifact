import type { SceneTemplateInterface } from './spec';
import { extractSceneScriptInterfaces } from './scriptInterfaceExtractor';

export const builtinScenePrefix = 'pixifact:';
export const builtinSceneNames = [] as const;

export type BuiltinSceneName = typeof builtinSceneNames[number];
export type BuiltinSceneScriptSources = Record<BuiltinSceneName, string>;

const builtinSceneNameSet = new Set<string>(builtinSceneNames);

export function isBuiltinSceneName(value: string): value is BuiltinSceneName {
    return builtinSceneNameSet.has(value);
}

export function builtinSceneAssetId(name: string) {
    if (!isBuiltinSceneName(name)) {
        throw new Error(`Unknown built-in Scene "${name}".`);
    }
    return `${builtinScenePrefix}${name}.scene`;
}

export function isBuiltinSceneAssetId(value: string) {
    return value.startsWith(builtinScenePrefix);
}

export function builtinSceneNameFromAssetId(assetId: string) {
    if (!isBuiltinSceneAssetId(assetId) || !assetId.endsWith('.scene')) {
        throw new Error(`Built-in Scene id "${assetId}" must use ${builtinScenePrefix}<Name>.scene.`);
    }
    const name = assetId.slice(builtinScenePrefix.length, -'.scene'.length);
    if (!isBuiltinSceneName(name)) {
        throw new Error(`Unknown built-in Scene "${name}".`);
    }
    return name;
}

export function builtinSceneAssetIds() {
    return builtinSceneNames.map(builtinSceneAssetId);
}

export function builtinSceneInterface(
    assetId: string,
    scriptSources: BuiltinSceneScriptSources,
): SceneTemplateInterface {
    return builtinSceneInterfaceDescriptors(scriptSources)[assetId].interface;
}

export function builtinSceneInterfaces(scriptSources: BuiltinSceneScriptSources) {
    const descriptors = builtinSceneInterfaceDescriptors(scriptSources);
    return Object.fromEntries(builtinSceneAssetIds().map((assetId) => [assetId, descriptors[assetId].interface]));
}

function builtinSceneInterfaceDescriptors(scriptSources: BuiltinSceneScriptSources) {
    const descriptors = extractSceneScriptInterfaces(builtinSceneNames.map((name) => ({
        scene: builtinSceneAssetId(name),
        fileName: `${name}.ts`,
        source: scriptSources[name],
    })));
    for (const assetId of builtinSceneAssetIds()) {
        const name = builtinSceneNameFromAssetId(assetId);
        const descriptor = descriptors[assetId];
        if (!descriptor) {
            throw new Error(`Built-in Scene "${assetId}" is missing a @scene script.`);
        }
        if (descriptor.className !== name) {
            throw new Error(`Built-in Scene "${assetId}" name must match @scene class "${descriptor.className}".`);
        }
    }
    return descriptors;
}
