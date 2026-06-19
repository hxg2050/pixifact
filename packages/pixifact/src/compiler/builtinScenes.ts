import type { SceneTemplateInterface } from './spec';
import { extractSceneScriptInterface } from './scriptInterfaceExtractor';

export const builtinScenePrefix = 'pixifact:';
export const builtinSceneNames = [
    'CenterContainer',
    'Control',
    'FlexItem',
    'FlexLayout',
    'HBoxContainer',
    'MarginContainer',
    'VBoxContainer',
] as const;

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
    const name = builtinSceneNameFromAssetId(assetId);
    const descriptor = extractSceneScriptInterface(scriptSources[name], `${name}.ts`, { scene: assetId });
    if (descriptor.className !== name) {
        throw new Error(`Built-in Scene "${assetId}" name must match @scene class "${descriptor.className}".`);
    }
    return descriptor.interface;
}

export function builtinSceneInterfaces(scriptSources: BuiltinSceneScriptSources) {
    return Object.fromEntries(
        builtinSceneAssetIds().map((assetId) => [assetId, builtinSceneInterface(assetId, scriptSources)]),
    );
}
