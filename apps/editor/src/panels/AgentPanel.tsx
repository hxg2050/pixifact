import { useI18n } from '../i18n';
import { useEditorStore } from '../editorStore';
import { createAgentCliWorkflow } from './agentWorkflow';

export function AgentPanel() {
    const t = useI18n();
    const projectTree = useEditorStore((state) => state.projectTree);
    const openedScenePath = useEditorStore((state) => state.openedScenePath);
    const workflow = createAgentCliWorkflow({ projectTree, openedScenePath });
    const liveCommand = 'bun run pixifact -- live scene get';

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
            <section className="agentTools">
                <strong>{t('agentToolsTitle')}</strong>
                <div>
                    {[
                        'scene inspect',
                        'scene validate',
                        'compile-scenes',
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
