import fs from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import {
    builtinSceneNames,
    builtinSceneNameFromAssetId,
    type BuiltinSceneScriptSources,
} from '../compiler/builtinScenes';

const builtinScenesDir = resolveBuiltinScenesDir(import.meta.url);

function resolveBuiltinScenesDir(metaUrl: string) {
    const url = new URL('../builtin-scenes/', metaUrl);
    if (url.protocol === 'file:') {
        return fileURLToPath(url);
    }

    const pathname = decodeURIComponent(url.pathname).replace(/^\/@fs\//, '/');
    if (path.isAbsolute(pathname) && fs.existsSync(pathname)) {
        return pathname;
    }

    return path.resolve(process.cwd(), 'packages/pixifact/src/builtin-scenes');
}

export function builtinSceneFilePath(assetId: string) {
    return path.join(builtinScenesDir, `${builtinSceneNameFromAssetId(assetId)}.scene`);
}

export function builtinSceneScriptPath(assetId: string) {
    const sourcePath = path.join(builtinScenesDir, `${builtinSceneNameFromAssetId(assetId)}.ts`);
    if (fs.existsSync(sourcePath)) {
        return sourcePath;
    }
    return path.join(builtinScenesDir, `${builtinSceneNameFromAssetId(assetId)}.js`);
}

export async function readBuiltinSceneSource(assetId: string) {
    return readFile(builtinSceneFilePath(assetId), 'utf8');
}

export async function readBuiltinSceneScriptSource(assetId: string) {
    return readFile(builtinSceneScriptPath(assetId), 'utf8');
}

export async function readBuiltinSceneScriptSources(): Promise<BuiltinSceneScriptSources> {
    const entries = await Promise.all(
        builtinSceneNames.map(async (name) => [name, await readFile(path.join(builtinScenesDir, `${name}.ts`), 'utf8')] as const),
    );
    return Object.fromEntries(entries) as BuiltinSceneScriptSources;
}

export function readBuiltinSceneScriptSourcesSync(): BuiltinSceneScriptSources {
    return Object.fromEntries(
        builtinSceneNames.map((name) => [name, fs.readFileSync(path.join(builtinScenesDir, `${name}.ts`), 'utf8')] as const),
    ) as BuiltinSceneScriptSources;
}

export async function assertBuiltinSceneScript(assetId: string) {
    const scriptPath = builtinSceneScriptPath(assetId);
    if (!await exists(scriptPath)) {
        throw new Error(`Built-in Scene "${assetId}" requires script "${scriptPath}".`);
    }
    return scriptPath;
}

async function exists(filePath: string) {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
}
