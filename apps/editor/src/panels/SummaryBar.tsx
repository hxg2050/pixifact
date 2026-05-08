import type { SceneDocument } from 'pixifact';
import { useI18n } from '../i18n';
import { collectHierarchy } from './common';

export function SummaryBar({ document }: { document: SceneDocument }) {
    const t = useI18n();
    const hierarchy = collectHierarchy(document.scene.root);
    const componentCount = hierarchy.reduce((total, item) => total + (item.node.components?.length ?? 0), 0);

    return (
        <div className="summaryBar" aria-label={t('summaryLabel')} data-testid="summary-bar">
            <span>{document.scene.name}</span>
            <span>{t('nodeCount', { count: hierarchy.length })}</span>
            <span>{t('componentCount', { count: componentCount })}</span>
            <span>{t('actionCount', { count: document.actions.length })}</span>
            <span>{document.dirty ? t('modified') : t('saved')}</span>
        </div>
    );
}
