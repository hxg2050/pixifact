import { getCompilerSceneDocument } from '../document/compilerSceneDocumentController';
import { useI18n } from '../i18n';
import type { CompilerSceneTemplateNode } from '../services/projectFileTree';
import { useCompilerSceneRevision } from './common';

export function SummaryBar() {
    useCompilerSceneRevision();
    const t = useI18n();
    const document = getCompilerSceneDocument();
    if (!document) {
        return null;
    }

    return (
        <div className="summaryBar" aria-label={t('summaryLabel')} data-testid="summary-bar">
            <span>{document.template.name}</span>
            <span>{t('nodeCount', { count: countCompilerSceneNodes(document.template.children) })}</span>
            <span>{Object.keys(document.template.interface.props).length} props</span>
            <span>{Object.keys(document.template.interface.events).length} events</span>
            <span>{Object.keys(document.template.interface.slots).length} slots</span>
            <span>{document.dirty ? t('modified') : t('saved')}</span>
        </div>
    );
}

function countCompilerSceneNodes(nodes: readonly CompilerSceneTemplateNode[]): number {
    let count = 1;
    for (const node of nodes) {
        count += 1;
        if (node.kind === 'pixi') {
            count += countCompilerSceneNodes(node.children) - 1;
        }
        if (node.kind === 'sceneInstance') {
            for (const children of Object.values(node.slots)) {
                count += countCompilerSceneNodes(children) - 1;
            }
        }
    }
    return count;
}
