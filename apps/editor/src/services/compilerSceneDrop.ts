import { addCompilerSceneInstanceNode } from '../document/compilerSceneDocumentController';
import { findFileByPath } from './projectFileTree';
import type { ProjectFileTreeNode } from './projectFileTree';
import { readCompilerSceneBinding } from './sceneBindingIndex';

export interface AddCompilerSceneDropOptions {
    openedScenePath?: string;
    projectTree: ProjectFileTreeNode | undefined;
    scenePath: string;
    parentLocator: string;
}

export async function addDroppedCompilerSceneInstance({
    openedScenePath,
    projectTree,
    scenePath,
    parentLocator,
}: AddCompilerSceneDropOptions) {
    if (scenePath === openedScenePath) {
        return {
            ok: false as const,
            errorKey: 'sceneCannotDropSelf' as const,
        };
    }

    const file = projectTree ? findFileByPath(projectTree, scenePath) : undefined;
    if (!projectTree || !file || file.kind !== 'scene') {
        return {
            ok: false as const,
            errorKey: 'droppedFileNotScene' as const,
        };
    }

    const binding = await readCompilerSceneBinding(projectTree, file);
    return addCompilerSceneInstanceNode(
        parentLocator,
        binding.scenePath,
        binding.template,
        binding.interface,
        binding.className,
    );
}
