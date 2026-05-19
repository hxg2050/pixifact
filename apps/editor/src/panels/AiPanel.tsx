import { useI18n } from '../i18n';

export function AiPanel() {
    const t = useI18n();
    const fileCommand = 'bun run pixifact -- scene get --project-root <project> --scene <scene>';
    const liveCommand = 'bun run pixifact -- live scene get';

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
                        <code>{fileCommand}</code>
                    </li>
                    <li>
                        <span>{t('agentStepRegisterClient')}</span>
                        <code>{liveCommand}</code>
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
                    {['summary', 'scene get', 'node inspect', 'commands dry-run', 'commands apply', 'commands validate'].map((command) => (
                        <code key={command}>{command}</code>
                    ))}
                </div>
                <p>{t('agentToolsRule')}</p>
            </section>
        </div>
    );
}
