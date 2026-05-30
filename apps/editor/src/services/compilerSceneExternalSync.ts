import { getCompilerSceneDocument } from '../document/compilerSceneDocumentController';
import { validateSceneContent } from '../../../../packages/pixifact/src/compiler/sceneProposal';
import type { SceneContentValidationResult } from '../../../../packages/pixifact/src/compiler/sceneProposal';
import { resolveSceneReference } from '../../../../packages/pixifact/src/compiler/sceneAssetPair';
import type { HostProjectFileChangedEvent } from './hostBridge';
import {
    findFileByPath,
    openCompilerSceneFile,
    projectFileRelativePath,
    readProjectFileText,
    refreshCompilerSceneBindingSnapshot,
} from './projectFileTree';
import type { ProjectFileTreeNode } from './projectFileTree';
import { isCompilerBindingSourceChange } from './compilerSceneBindingSync';
import { readCompilerSceneBindingIndex, sceneInterfacesForCompilerTemplate } from './sceneBindingIndex';

export type CompilerSceneExternalSyncResult =
    | { status: 'ignored' }
    | { status: 'sceneReloaded'; message: string; validation: Extract<SceneContentValidationResult, { ok: true }> }
    | { status: 'validationFailed'; message: string; validation: Extract<SceneContentValidationResult, { ok: false }> }
    | { status: 'bindingRefreshed' }
    | { status: 'dirtySkipped'; message: string };

export interface CompilerSceneExternalSyncInput {
    projectTree?: ProjectFileTreeNode;
    openedScenePath?: string;
    event: HostProjectFileChangedEvent;
}

const dirtySkippedMessage = '当前打开的 Scene 有未保存修改，已跳过外部文件刷新。';
const sceneReloadedMessage = '外部 Scene 修改已刷新，校验通过。';
const validationFailedMessage = '外部 Scene 修改未刷新：校验失败。';

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

function collectProjectAssets(projectTree: ProjectFileTreeNode) {
    const assets = new Set<string>();
    function visit(node: ProjectFileTreeNode) {
        if (node.kind === 'asset') {
            assets.add(projectFileRelativePath(projectTree, node));
        }
        for (const child of node.children ?? []) {
            visit(child);
        }
    }
    visit(projectTree);
    return assets;
}

async function validateChangedScene(projectTree: ProjectFileTreeNode, file: ProjectFileTreeNode) {
    const content = await readProjectFileText(projectTree, file);
    const scenePath = projectFileRelativePath(projectTree, file);
    const bindingIndex = await readCompilerSceneBindingIndex(projectTree);
    return validateSceneContent({
        scene: scenePath,
        content,
        existingAssets: collectProjectAssets(projectTree),
        sceneInterfaces: sceneInterfacesForCompilerTemplate(bindingIndex, bindingIndex[scenePath]?.template.children ?? [], scenePath),
        normalizeSceneReference: (scene) => resolveSceneReference(scenePath, scene),
    });
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
        const validation = await validateChangedScene(projectTree, file);
        if (!validation.ok) {
            return {
                status: 'validationFailed',
                message: validationFailedMessage,
                validation,
            };
        }
        await openCompilerSceneFile(projectTree, file);
        return {
            status: 'sceneReloaded',
            message: sceneReloadedMessage,
            validation,
        };
    }

    await refreshCompilerSceneBindingSnapshot(projectTree, file, document.template);
    return { status: 'bindingRefreshed' };
}
