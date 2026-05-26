import type { CompilerSceneExternalSyncResult } from './compilerSceneExternalSync';

export type LastExternalSceneSync = Exclude<CompilerSceneExternalSyncResult, { status: 'ignored' }>;

let lastExternalSceneSync: { scenePath: string; result: LastExternalSceneSync } | undefined;

export function getLastExternalSceneSync(scenePath: string) {
    return lastExternalSceneSync?.scenePath === scenePath
        ? structuredClone(lastExternalSceneSync.result)
        : undefined;
}

export function setLastExternalSceneSync(scenePath: string, result: CompilerSceneExternalSyncResult) {
    if (result.status === 'ignored') {
        return;
    }
    lastExternalSceneSync = {
        scenePath,
        result: structuredClone(result),
    };
}

export function clearLastExternalSceneSync() {
    lastExternalSceneSync = undefined;
}
