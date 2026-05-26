import { getCompilerSceneDocument } from '../document/compilerSceneDocumentController';
import type { HostProjectFileChangedEvent } from './hostBridge';
import {
    findFileByPath,
    openCompilerSceneFile,
    projectFileRelativePath,
    refreshCompilerSceneBindingSnapshot,
} from './projectFileTree';
import type { ProjectFileTreeNode } from './projectFileTree';
import { isCompilerBindingSourceChange } from './compilerSceneBindingSync';

export type CompilerSceneExternalSyncResult =
    | { status: 'ignored' }
    | { status: 'sceneReloaded' }
    | { status: 'bindingRefreshed' }
    | { status: 'dirtySkipped'; message: string };

export interface CompilerSceneExternalSyncInput {
    projectTree?: ProjectFileTreeNode;
    openedScenePath?: string;
    event: HostProjectFileChangedEvent;
}

const dirtySkippedMessage = '当前打开的 Scene 有未保存修改，已跳过外部文件刷新。';

function eventMatchesOpenedScene(
    projectTree: ProjectFileTreeNode,
    openedScenePath: string,
    event: HostProjectFileChangedEvent,
) {
    const file = findFileByPath(projectTree, openedScenePath);
    return file?.kind === 'scene'
        && event.kind === 'scene'
        && (event.path === file.path || event.path === projectFileRelativePath(projectTree, file));
}

export async function syncOpenedCompilerSceneFromHostChange({
    projectTree,
    openedScenePath,
    event,
}: CompilerSceneExternalSyncInput): Promise<CompilerSceneExternalSyncResult> {
    if (!projectTree || !openedScenePath) {
        return { status: 'ignored' };
    }
    const projectRootPath = projectTree.projectRootPath ?? projectTree.systemPath;
    if (event.projectRootPath !== projectRootPath || !isCompilerBindingSourceChange(event)) {
        return { status: 'ignored' };
    }
    const document = getCompilerSceneDocument();
    if (!document || document.scenePath !== openedScenePath) {
        return { status: 'ignored' };
    }
    const file = findFileByPath(projectTree, openedScenePath);
    if (!file || file.kind !== 'scene') {
        return { status: 'ignored' };
    }
    if (eventMatchesOpenedScene(projectTree, openedScenePath, event)) {
        if (document.dirty) {
            return {
                status: 'dirtySkipped',
                message: dirtySkippedMessage,
            };
        }
        await openCompilerSceneFile(projectTree, file);
        return { status: 'sceneReloaded' };
    }

    await refreshCompilerSceneBindingSnapshot(projectTree, file, document.template);
    return { status: 'bindingRefreshed' };
}
