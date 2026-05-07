import type { EditorDocument } from '../../../../src';
import { useI18n } from '../i18n';
import { PixifactViewport } from '../preview/PixifactViewport';
import { useDocumentRevision } from './common';

export function ViewportPanel({ document, revision }: { document: EditorDocument; revision: number }) {
    const liveRevision = useDocumentRevision();
    const t = useI18n();

    return (
        <main className="viewportSurface" aria-label={t('viewportLabel')}>
            <div className="viewportToolbar">
                <span>{document.prefab.name}.prefab</span>
                <div className="viewportActions">
                    <button type="button">100%</button>
                    <button type="button">{t('fit')}</button>
                    <button type="button">{t('grid')}</button>
                </div>
            </div>
            <section className="canvasWrap" aria-label={t('runtimeCanvasLabel')} data-testid="viewport-stage">
                <div className="stageFrame">
                    <PixifactViewport document={document} revision={Math.max(revision, liveRevision)} />
                </div>
            </section>
        </main>
    );
}
