import { useI18n } from '../i18n';

export function AiPanel() {
    const t = useI18n();
    const bridgeCommand = 'bun run editor:mcp';
    const clientCommand = 'codex mcp add pixifact -- bun /Users/youxia/work/github/pixif/apps/editor/src/mcp/pixifact-mcp-server.ts';

    return (
        <div className="aiSurface agentSurface">
            <section className="agentHero">
                <span>{t('agentPrimaryLabel')}</span>
                <strong>{t('agentPanelTitle')}</strong>
                <p>{t('agentPanelIntro')}</p>
            </section>
            <section className="agentSteps">
                <strong>{t('agentSetupTitle')}</strong>
                <ol>
                    <li>
                        <span>{t('agentStepStartMcp')}</span>
                        <code>{bridgeCommand}</code>
                    </li>
                    <li>
                        <span>{t('agentStepRegisterClient')}</span>
                        <code>{clientCommand}</code>
                    </li>
                    <li>
                        <span>{t('agentStepUseExternal')}</span>
                        <code>{t('agentPromptExample')}</code>
                    </li>
                </ol>
            </section>
            <section className="agentTools">
                <strong>{t('agentToolsTitle')}</strong>
                <div>
                    {['get_scene', 'inspect_node', 'dry_run_commands', 'apply_commands', 'validate_commands'].map((tool) => (
                        <code key={tool}>{tool}</code>
                    ))}
                </div>
                <p>{t('agentToolsRule')}</p>
            </section>
        </div>
    );
}
