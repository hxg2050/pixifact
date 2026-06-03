import { builtinSceneAssetId, builtinSceneNameFromAssetId, isBuiltinSceneAssetId } from './builtinScenes';

export const defaultSceneSourceRoots = ['src'] as const;
export const ignoredSceneSourceDirectories = new Set([
    'node_modules',
    'build',
    'dist',
    'generated',
    '.pixifact',
    'coverage',
    'test-results',
]);

export function toPosixPath(value: string) {
    return value.replaceAll('\\', '/');
}

function posixBasename(value: string, suffix = '') {
    const basename = value.split('/').filter(Boolean).at(-1) ?? '';
    return suffix && basename.endsWith(suffix)
        ? basename.slice(0, -suffix.length)
        : basename;
}

function posixDirname(value: string) {
    const normalized = toPosixPath(value).replace(/\/+$/, '');
    const index = normalized.lastIndexOf('/');
    return index >= 0 ? normalized.slice(0, index) : '';
}

function normalizePosixPath(value: string) {
    const segments: string[] = [];
    for (const segment of toPosixPath(value).split('/')) {
        if (!segment || segment === '.') {
            continue;
        }
        if (segment === '..') {
            if (segments.length && segments[segments.length - 1] !== '..') {
                segments.pop();
            } else {
                segments.push(segment);
            }
            continue;
        }
        segments.push(segment);
    }
    return segments.join('/');
}

function posixJoin(...parts: string[]) {
    return normalizePosixPath(parts.filter(Boolean).join('/'));
}

export function normalizeSceneAssetId(value: string) {
    if (isBuiltinSceneAssetId(value)) {
        return builtinSceneAssetId(builtinSceneNameFromAssetId(value));
    }
    const normalized = toPosixPath(value).replace(/^\.\/+/, '').replace(/^\/+/, '');
    const parts = normalized.split('/').filter(Boolean);
    if (parts.includes('..')) {
        throw new Error(`Scene path "${value}" must stay inside projectRoot.`);
    }
    if (!normalized.endsWith('.scene')) {
        throw new Error(`Scene path "${value}" must end with .scene.`);
    }
    return parts.join('/');
}

export function isIgnoredSceneSourceDirectory(name: string) {
    return ignoredSceneSourceDirectories.has(name);
}

export function sceneLocalName(scenePath: string) {
    if (isBuiltinSceneAssetId(scenePath)) {
        return builtinSceneNameFromAssetId(scenePath);
    }
    return posixBasename(normalizeSceneAssetId(scenePath), '.scene');
}

export function pairedSceneScriptPath(scenePath: string) {
    if (isBuiltinSceneAssetId(scenePath)) {
        return `${builtinSceneNameFromAssetId(scenePath)}.ts`;
    }
    const assetId = normalizeSceneAssetId(scenePath);
    return `${assetId.slice(0, -'.scene'.length)}.ts`;
}

export function generatedSceneModulePath(scenePath: string) {
    if (isBuiltinSceneAssetId(scenePath)) {
        return `pixifact-builtin/${builtinSceneNameFromAssetId(scenePath)}.scene.generated.ts`;
    }
    return `${normalizeSceneAssetId(scenePath).slice(0, -'.scene'.length)}.scene.generated.ts`;
}

export function generatedSceneModuleImport(scenePath: string) {
    return `./${generatedSceneModulePath(scenePath).replace(/\.ts$/, '')}`;
}

export function sceneClassAlias(scenePath: string) {
    if (isBuiltinSceneAssetId(scenePath)) {
        return `BuiltinSceneClass_${builtinSceneNameFromAssetId(scenePath)}`;
    }
    const base = normalizeSceneAssetId(scenePath)
        .slice(0, -'.scene'.length)
        .split('/')
        .map((segment) => segment.replace(/[^A-Za-z0-9]/g, (character) => `_x${character.charCodeAt(0).toString(16)}_`))
        .join('_');
    return `SceneClass_${base}`;
}

export function resolveSceneReference(fromScenePath: string, reference: string) {
    const value = toPosixPath(reference.trim());
    if (isBuiltinSceneAssetId(value)) {
        return normalizeSceneAssetId(value);
    }
    if (!value.endsWith('.scene')) {
        throw new Error('Scene references must use .scene paths.');
    }
    if (value.startsWith('./') || value.startsWith('../')) {
        const baseDir = posixDirname(normalizeSceneAssetId(fromScenePath));
        return normalizeSceneAssetId(posixJoin(baseDir, value));
    }
    return normalizeSceneAssetId(value);
}
