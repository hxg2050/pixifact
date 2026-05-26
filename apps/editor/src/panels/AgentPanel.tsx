import { useState } from 'react';
import { useI18n } from '../i18n';
import { useEditorStore } from '../editorStore';
import { Button } from '../components/system';
import {
    findFileByPath,
    openCompilerSceneFile,
    parentPath,
    refreshProjectFileTree,
} from '../services/projectFileTree';
import { createAgentCliWorkflow } from './agentWorkflow';
import {
    applyCurrentSceneProposal,
    checkCurrentSceneProposal,
    describeSceneProposalDiff,
} from './agentProposalReview';
import type { AgentProposalReviewResult } from './agentProposalReview';

export function AgentPanel() {
    const t = useI18n();
    const projectTree = useEditorStore((state) => state.projectTree);
    const openedScenePath = useEditorStore((state) => state.openedScenePath);
    const refreshProject = useEditorStore((state) => state.refreshProject);
    const setOpenedScene = useEditorStore((state) => state.setOpenedScene);
    const workflow = createAgentCliWorkflow({ projectTree, openedScenePath });
    const liveCommand = 'bun run pixifact -- live scene get';
    const [proposalText, setProposalText] = useState('');
    const [proposalResult, setProposalResult] = useState<AgentProposalReviewResult | undefined>();
    const [proposalError, setProposalError] = useState('');
    const [checkingProposal, setCheckingProposal] = useState(false);
    const [applyingProposal, setApplyingProposal] = useState(false);
    const canReviewProposal = workflow.projectReady && workflow.sceneReady && proposalText.trim() !== '';

    async function reviewProposal() {
        setCheckingProposal(true);
        setProposalError('');
        try {
            setProposalResult(await checkCurrentSceneProposal({ projectTree, openedScenePath, proposalText }));
        } catch (error) {
            setProposalResult(undefined);
            setProposalError(error instanceof Error ? error.message : String(error));
        } finally {
            setCheckingProposal(false);
        }
    }

    async function applyProposal() {
        setApplyingProposal(true);
        setProposalError('');
        try {
            const result = await applyCurrentSceneProposal({ projectTree, openedScenePath, proposalText });
            setProposalResult(result);
            if (result.ok && projectTree && openedScenePath) {
                const refreshedTree = await refreshProjectFileTree(projectTree);
                const file = findFileByPath(refreshedTree, openedScenePath);
                if (file) {
                    await openCompilerSceneFile(refreshedTree, file);
                    refreshProject(refreshedTree, { selectPath: openedScenePath, expandPaths: [parentPath(openedScenePath)] });
                    setOpenedScene(openedScenePath);
                }
            }
        } catch (error) {
            setProposalResult(undefined);
            setProposalError(error instanceof Error ? error.message : String(error));
        } finally {
            setApplyingProposal(false);
        }
    }

    return (
        <div className="agentPanelSurface agentSurface">
            <section className="agentHero">
                <span>{t('agentPrimaryLabel')}</span>
                <strong>{t('agentPanelTitle')}</strong>
                <p>{t('agentPanelIntro')}</p>
                <div className="agentTargetGrid">
                    <span>{t('agentProjectRoot')}</span>
                    <code>{workflow.projectRoot}</code>
                    <span>{t('agentScenePath')}</span>
                    <code>{workflow.scenePath}</code>
                </div>
            </section>
            <section className="agentSteps">
                <strong>{t('agentSetupTitle')}</strong>
                <ol>
                    <li>
                        <span>{t('agentStepInspectScene')}</span>
                        <code>{workflow.commands[0]}</code>
                    </li>
                    <li>
                        <span>{t('agentStepValidateScene')}</span>
                        <code>{workflow.commands[1]}</code>
                    </li>
                    <li>
                        <span>{t('agentStepCompileScene')}</span>
                        <code>{workflow.commands[2]}</code>
                    </li>
                    <li>
                        <span>{t('agentStepBuildProject')}</span>
                        <code>{workflow.commands[3]}</code>
                    </li>
                </ol>
            </section>
            <section className="agentPromptCard">
                <strong>{t('agentPromptTitle')}</strong>
                <code>{workflow.agentPrompt}</code>
            </section>
            <section className="agentReviewCard">
                <div className="agentReviewHeader">
                    <strong>{t('agentReviewTitle')}</strong>
                    <span>{t('agentReviewHint')}</span>
                </div>
                <textarea
                    aria-label={t('agentProposalInputLabel')}
                    disabled={!workflow.sceneReady}
                    onChange={(event) => {
                        setProposalText(event.target.value);
                        setProposalResult(undefined);
                        setProposalError('');
                    }}
                    placeholder={t('agentProposalPlaceholder')}
                    value={proposalText}
                />
                <div className="agentReviewActions">
                    <Button
                        disabled={!canReviewProposal || checkingProposal || applyingProposal}
                        icon="eye"
                        onPress={() => void reviewProposal()}
                        variant="default"
                    >
                        {checkingProposal ? t('agentReviewChecking') : t('agentReviewCheck')}
                    </Button>
                    <Button
                        disabled={!proposalResult?.ok || applyingProposal || checkingProposal}
                        icon="check"
                        onPress={() => void applyProposal()}
                        variant="primary"
                    >
                        {applyingProposal ? t('agentReviewApplying') : t('agentReviewApply')}
                    </Button>
                </div>
                {proposalError ? (
                    <div className="agentReviewResult failed">{proposalError}</div>
                ) : null}
                {proposalResult ? (
                    <div className={`agentReviewResult ${proposalResult.ok ? '' : 'failed'}`}>
                        <strong>{proposalResult.ok ? t('agentReviewOk') : t('agentReviewFailed')}</strong>
                        {proposalResult.ok ? (
                            <ul>
                                {proposalResult.diffs.length === 0 ? (
                                    <li>{t('agentReviewNoDiff')}</li>
                                ) : proposalResult.diffs.map((diff, index) => (
                                    <li key={`${diff.kind}-${index}`}>{describeSceneProposalDiff(diff)}</li>
                                ))}
                            </ul>
                        ) : (
                            <>
                                <p>{proposalResult.error}</p>
                                {proposalResult.hint ? <p>{proposalResult.hint}</p> : null}
                                {proposalResult.diagnostics ? (
                                    <ul>
                                        {proposalResult.diagnostics.map((diagnostic) => (
                                            <li key={`${diagnostic.path}-${diagnostic.prop}`}>
                                                {diagnostic.path} {diagnostic.prop}: {diagnostic.actual} / {diagnostic.expected}
                                            </li>
                                        ))}
                                    </ul>
                                ) : null}
                            </>
                        )}
                    </div>
                ) : null}
            </section>
            <section className="agentTools">
                <strong>{t('agentToolsTitle')}</strong>
                <div>
                    {[
                        'scene inspect',
                        'scene validate',
                        'compile-scenes',
                        'scene proposal check',
                        'scene proposal apply',
                        workflow.sceneReady ? liveCommand : 'live scene get',
                    ].map((command) => (
                        <code key={command}>{command}</code>
                    ))}
                </div>
                <p>{t('agentToolsRule')}</p>
            </section>
        </div>
    );
}
