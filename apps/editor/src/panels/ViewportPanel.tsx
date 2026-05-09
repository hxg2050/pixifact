import type { SceneDocument } from 'pixifact';
import { useEditorStore } from '../editorStore';
import { useI18n } from '../i18n';
import { PixifactViewport } from '../preview/PixifactViewport';
import { useDocumentRevision } from './common';

export function ViewportPanel({ document, revision }: { document: SceneDocument; revision: number }) {
    const liveRevision = useDocumentRevision();
    const openedScenePath = useEditorStore((state) => state.openedScenePath);
    const t = useI18n();

    return (
        <main className="viewportSurface" aria-label={t('viewportLabel')}>
            <div className="viewportToolbar">
                <span>{openedScenePath ? `${document.scene.name}.scene` : t('viewportLabel')}</span>
                {openedScenePath ? (
                    <div className="viewportActions">
                        <button type="button">100%</button>
                        <button type="button">{t('fit')}</button>
                        <button type="button">{t('grid')}</button>
                    </div>
                ) : null}
            </div>
            <section className="canvasWrap" aria-label={t('runtimeCanvasLabel')} data-testid="viewport-stage">
                {openedScenePath ? (
                    <div className="stageFrame">
                        <PixifactViewport document={document} revision={Math.max(revision, liveRevision)} />
                    </div>
                ) : (
                    <div className="panelEmptyState">
                        <strong>{t('viewportEmptyTitle')}</strong>
                        <span>{t('viewportEmptyHint')}</span>
                    </div>
                )}
            </section>
        </main>
    );
}
