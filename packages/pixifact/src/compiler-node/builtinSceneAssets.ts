import fs from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import {
    builtinSceneNameFromAssetId,
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
