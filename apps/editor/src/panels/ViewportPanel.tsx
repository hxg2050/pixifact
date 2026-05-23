import type { SceneDocument } from 'pixifact';
import { getCompilerSceneDocument } from '../document/compilerSceneDocumentController';
import { useEditorStore } from '../editorStore';
import { useI18n } from '../i18n';
import { PixifactViewport } from '../preview/PixifactViewport';
import { useCompilerSceneRevision, useDocumentRevision } from './common';

export function ViewportPanel({ document, revision }: { document: SceneDocument; revision: number }) {
    const liveRevision = useDocumentRevision();
    useCompilerSceneRevision();
    const openedScenePath = useEditorStore((state) => state.openedScenePath);
    const compilerDocument = getCompilerSceneDocument();
    const t = useI18n();
    const isCompilerScene = openedScenePath && compilerDocument?.scenePath === openedScenePath;

    return (
        <main className="viewportSurface" aria-label={t('viewportLabel')}>
            <div className="viewportToolbar">
                <span>{isCompilerScene ? `${compilerDocument.template.name}.scene` : openedScenePath ? `${document.scene.name}.scene` : t('viewportLabel')}</span>
                {openedScenePath ? (
                    <div className="viewportActions">
                        <button type="button">100%</button>
                        <button type="button">{t('fit')}</button>
                        <button type="button">{t('grid')}</button>
                    </div>
                ) : null}
            </div>
            <section className="canvasWrap" aria-label={t('runtimeCanvasLabel')} data-testid="viewport-stage">
                {isCompilerScene ? (
                    <div className="panelEmptyState">
                        <strong>{compilerDocument.template.name}</strong>
                        <span>Compiler Scene readonly preview is not rendered in editor yet.</span>
                    </div>
                ) : openedScenePath ? (
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
