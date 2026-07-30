import type { SceneTemplateInterface } from '../compiler/spec';
import {
    builtinSceneAssetId,
    builtinSceneAssetIds,
    builtinSceneNameFromAssetId,
    builtinSceneNames,
    type BuiltinSceneScriptSources,
} from '../compiler/builtinScenes';
import { extractSceneScriptInterfaces } from './scriptInterfaceExtractor';

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
