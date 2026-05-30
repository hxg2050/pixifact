import {
    applySceneProposal,
    checkSceneProposal,
    createSceneRevision,
} from '../../../../packages/pixifact/src/compiler/sceneProposal';
import type {
    SceneProposalCheckResult,
    SceneProposalDiffEntry,
    SceneProposalEnvelope,
} from '../../../../packages/pixifact/src/compiler/sceneProposal';
import {
    findFileByPath,
    projectFileRelativePath,
    readProjectFileText,
} from '../services/projectFileTree';
import type { ProjectFileTreeNode } from '../services/projectFileTree';
import { readCompilerSceneBindingIndex, sceneInterfacesForCompilerTemplate } from '../services/sceneBindingIndex';
import { writeHostProjectFileText } from '../services/hostBridge';
import { parseSceneTemplate } from '../../../../packages/pixifact/src/compiler/templateParser';
import { resolveSceneReference } from '../../../../packages/pixifact/src/compiler/sceneAssetPair';

export type AgentProposalReviewResult = SceneProposalCheckResult & {
    scenePath?: string;
};

export interface AgentProposalReviewInput {
    projectTree?: ProjectFileTreeNode;
    openedScenePath?: string;
    proposalText: string;
}

export function describeSceneProposalDiff(entry: SceneProposalDiffEntry) {
    if (entry.kind === 'scenePropChanged') {
        return `Scene.${entry.prop}: ${String(entry.before)} -> ${String(entry.after)}`;
    }
    if (entry.kind === 'nodeInserted') {
        return `Insert ${entry.node} at ${entry.path}`;
    }
    if (entry.kind === 'nodeDeleted') {
        return `Delete ${entry.node} at ${entry.path}`;
    }
    if (entry.kind === 'nodeTypeChanged') {
        return `${entry.path}: ${entry.before} -> ${entry.after}`;
    }
    if (entry.kind === 'childrenChanged') {
        return `${entry.path} children: ${entry.before.join(', ')} -> ${entry.after.join(', ')}`;
    }
    return `${entry.node}.${entry.prop}: ${String(entry.before)} -> ${String(entry.after)}`;
}

function projectRootPath(projectTree: ProjectFileTreeNode) {
    const root = projectTree.projectRootPath ?? projectTree.systemPath;
    if (!root) {
        throw new Error('当前项目缺少本机路径，请使用桌面版重新打开项目。');
    }
    return root;
}

function openedScene(projectTree: ProjectFileTreeNode | undefined, openedScenePath: string | undefined) {
    if (!projectTree || !openedScenePath) {
        throw new Error('请先打开一个 compiler .scene 文件。');
    }
    const file = findFileByPath(projectTree, openedScenePath);
    if (!file || file.kind !== 'scene') {
        throw new Error('当前打开文件不是 compiler .scene。');
    }
    return file;
}

function openedReviewTarget(projectTree: ProjectFileTreeNode | undefined, openedScenePath: string | undefined) {
    if (!projectTree) {
        throw new Error('请先打开一个 compiler .scene 文件。');
    }
    const file = openedScene(projectTree, openedScenePath);
    return {
        projectTree,
        file,
        scenePath: projectFileRelativePath(projectTree, file),
    };
}

function collectProjectAssets(node: ProjectFileTreeNode, projectTree: ProjectFileTreeNode, assets = new Set<string>()) {
    if (node.kind === 'asset') {
        assets.add(projectFileRelativePath(projectTree, node));
        return assets;
    }
    for (const child of node.children ?? []) {
        collectProjectAssets(child, projectTree, assets);
    }
    return assets;
}

async function proposalContext(projectTree: ProjectFileTreeNode, proposalContent: string, ownerScenePath: string) {
    const template = parseSceneTemplate(proposalContent);
    const bindingIndex = await readCompilerSceneBindingIndex(projectTree);
    return {
        existingAssets: collectProjectAssets(projectTree, projectTree),
        sceneInterfaces: sceneInterfacesForCompilerTemplate(bindingIndex, template.children, ownerScenePath),
        normalizeSceneReference: (scene: string) => resolveSceneReference(ownerScenePath, scene),
    };
}

function parseProposal(text: string): SceneProposalEnvelope {
    const proposal = JSON.parse(text) as Partial<SceneProposalEnvelope>;
    if (proposal.kind !== 'pixifact.sceneProposal.v1') {
        throw new Error('proposal.kind must be "pixifact.sceneProposal.v1".');
    }
    if (typeof proposal.scene !== 'string' || proposal.scene.trim() === '') {
        throw new Error('proposal.scene must be a non-empty string.');
    }
    if (typeof proposal.baseRevision !== 'string' || proposal.baseRevision.trim() === '') {
        throw new Error('proposal.baseRevision must be a non-empty string.');
    }
    if (typeof proposal.content !== 'string' || proposal.content.trim() === '') {
        throw new Error('proposal.content must be a non-empty string.');
    }
    return {
        kind: 'pixifact.sceneProposal.v1',
        scene: proposal.scene,
        baseRevision: proposal.baseRevision,
        content: proposal.content,
    };
}

function targetMismatchResult(scenePath: string, proposal: SceneProposalEnvelope): AgentProposalReviewResult | undefined {
    if (proposal.scene === scenePath) {
        return undefined;
    }
    return {
        ok: false,
        scene: proposal.scene,
        baseRevision: proposal.baseRevision,
        error: 'Scene proposal target does not match the opened Scene.',
        hint: `Open ${proposal.scene} or create a proposal for ${scenePath}.`,
        scenePath,
    };
}

function staleRevisionResult(scenePath: string, currentContent: string, proposal: SceneProposalEnvelope): AgentProposalReviewResult | undefined {
    const currentRevision = createSceneRevision(currentContent);
    if (proposal.baseRevision === currentRevision) {
        return undefined;
    }
    return {
        ok: false,
        scene: proposal.scene,
        baseRevision: proposal.baseRevision,
        currentRevision,
        error: 'Scene proposal baseRevision does not match current scene revision.',
        hint: 'Re-read the current .scene file and create a new proposal with the current baseRevision.',
        scenePath,
    };
}

export async function checkCurrentSceneProposal(input: AgentProposalReviewInput): Promise<AgentProposalReviewResult> {
    const target = openedReviewTarget(input.projectTree, input.openedScenePath);
    const currentContent = await readProjectFileText(target.projectTree, target.file);
    const proposal = parseProposal(input.proposalText);
    const mismatch = targetMismatchResult(target.scenePath, proposal);
    if (mismatch) {
        return mismatch;
    }
    const stale = staleRevisionResult(target.scenePath, currentContent, proposal);
    if (stale) {
        return stale;
    }
    const context = await proposalContext(target.projectTree, proposal.content, target.scenePath);
    return {
        ...checkSceneProposal({
            currentContent,
            ...context,
            proposal,
        }),
        scenePath: target.scenePath,
    };
}

export async function applyCurrentSceneProposal(input: AgentProposalReviewInput): Promise<AgentProposalReviewResult> {
    const target = openedReviewTarget(input.projectTree, input.openedScenePath);
    const currentContent = await readProjectFileText(target.projectTree, target.file);
    const proposal = parseProposal(input.proposalText);
    const mismatch = targetMismatchResult(target.scenePath, proposal);
    if (mismatch) {
        return mismatch;
    }
    const stale = staleRevisionResult(target.scenePath, currentContent, proposal);
    if (stale) {
        return stale;
    }
    const context = await proposalContext(target.projectTree, proposal.content, target.scenePath);
    const result = applySceneProposal({
        currentContent,
        ...context,
        proposal,
    });
    if (!result.ok) {
        return {
            ...result,
            scenePath: target.scenePath,
        };
    }
    await writeHostProjectFileText(projectRootPath(target.projectTree), target.file.path, result.content);
    return {
        ...result,
        scenePath: target.scenePath,
    };
}
