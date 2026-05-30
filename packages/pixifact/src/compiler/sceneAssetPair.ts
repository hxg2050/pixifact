import path from 'node:path';

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
    return value.replaceAll(path.sep, '/').replaceAll('\\', '/');
}

export function normalizeSceneAssetId(value: string) {
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
    return path.posix.basename(normalizeSceneAssetId(scenePath), '.scene');
}

export function pairedSceneScriptPath(scenePath: string) {
    const assetId = normalizeSceneAssetId(scenePath);
    return `${assetId.slice(0, -'.scene'.length)}.ts`;
}

export function generatedSceneModulePath(scenePath: string) {
    return `${normalizeSceneAssetId(scenePath).slice(0, -'.scene'.length)}.scene.generated.ts`;
}

export function generatedSceneModuleImport(scenePath: string) {
    return `./${generatedSceneModulePath(scenePath).replace(/\.ts$/, '')}`;
}

export function sceneClassAlias(scenePath: string) {
    const base = normalizeSceneAssetId(scenePath)
        .slice(0, -'.scene'.length)
        .split('/')
        .map((segment) => segment.replace(/[^A-Za-z0-9]/g, (character) => `_x${character.charCodeAt(0).toString(16)}_`))
        .join('_');
    return `SceneClass_${base}`;
}

export function resolveSceneReference(fromScenePath: string, reference: string) {
    const value = toPosixPath(reference.trim());
    if (!value.endsWith('.scene')) {
        throw new Error('Scene references must use .scene paths.');
    }
    if (value.startsWith('./') || value.startsWith('../')) {
        const baseDir = path.posix.dirname(normalizeSceneAssetId(fromScenePath));
        return normalizeSceneAssetId(path.posix.normalize(path.posix.join(baseDir, value)));
    }
    return normalizeSceneAssetId(value);
}
