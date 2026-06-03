import type { SceneTemplateInterface } from './spec';

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

export function builtinSceneInterface(assetId: string): SceneTemplateInterface {
    const name = builtinSceneNameFromAssetId(assetId);
    if (name === 'Control') {
        return {
            props: {
                minWidth: { type: 'number', default: 0 },
                minHeight: { type: 'number', default: 0 },
                hSize: { type: 'string', default: 'content' },
                vSize: { type: 'string', default: 'content' },
                stretch: { type: 'number', default: 1 },
                alignX: { type: 'string', default: 'start' },
                alignY: { type: 'string', default: 'start' },
            },
            events: {},
            slots: { default: {} },
        };
    }
    if (name === 'HBoxContainer') {
        return {
            props: {
                gap: { type: 'number', default: 0 },
                alignY: { type: 'string', default: 'start' },
                justify: { type: 'string', default: 'start' },
            },
            events: {},
            slots: { default: {} },
        };
    }
    if (name === 'FlexLayout') {
        return {
            props: {
                direction: { type: 'string', default: 'row' },
                align: { type: 'string', default: 'start' },
                justify: { type: 'string', default: 'start' },
                gap: { type: 'number', default: 0 },
                paddingX: { type: 'number', default: 0 },
                paddingY: { type: 'number', default: 0 },
                paddingLeft: { type: 'number' },
                paddingRight: { type: 'number' },
                paddingTop: { type: 'number' },
                paddingBottom: { type: 'number' },
            },
            events: {},
            slots: { default: {} },
        };
    }
    if (name === 'FlexItem') {
        return {
            props: {
                grow: { type: 'number', default: 0 },
                shrink: { type: 'number', default: 1 },
                basis: { type: 'number', default: -1 },
                minWidth: { type: 'number', default: 0 },
                minHeight: { type: 'number', default: 0 },
                maxWidth: { type: 'number', default: -1 },
                maxHeight: { type: 'number', default: -1 },
                marginLeft: { type: 'number', default: 0 },
                marginRight: { type: 'number', default: 0 },
                marginTop: { type: 'number', default: 0 },
                marginBottom: { type: 'number', default: 0 },
                alignSelf: { type: 'string', default: 'auto' },
            },
            events: {},
            slots: { default: {} },
        };
    }
    if (name === 'VBoxContainer') {
        return {
            props: {
                gap: { type: 'number', default: 0 },
                alignX: { type: 'string', default: 'start' },
                justify: { type: 'string', default: 'start' },
            },
            events: {},
            slots: { default: {} },
        };
    }
    if (name === 'MarginContainer') {
        return {
            props: {
                margin: { type: 'number', default: 0 },
                marginLeft: { type: 'number' },
                marginRight: { type: 'number' },
                marginTop: { type: 'number' },
                marginBottom: { type: 'number' },
                alignX: { type: 'string', default: 'start' },
                alignY: { type: 'string', default: 'start' },
            },
            events: {},
            slots: { default: {} },
        };
    }
    return {
        props: {
            alignX: { type: 'string', default: 'center' },
            alignY: { type: 'string', default: 'center' },
        },
        events: {},
        slots: { default: {} },
    };
}

export function builtinSceneInterfaces() {
    return Object.fromEntries(
        builtinSceneAssetIds().map((assetId) => [assetId, builtinSceneInterface(assetId)]),
    );
}
