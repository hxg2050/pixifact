import { getCompilerSceneDocument } from '../document/compilerSceneDocumentController';
import { useEditorStore } from '../editorStore';
import { useI18n } from '../i18n';
import { CompilerSceneViewport } from '../preview/CompilerSceneViewport';
import { useCompilerSceneRevision } from './common';

export function ViewportPanel() {
    useCompilerSceneRevision();
    const openedScenePath = useEditorStore((state) => state.openedScenePath);
    const projectTree = useEditorStore((state) => state.projectTree);
    const compilerDocument = getCompilerSceneDocument();
    const t = useI18n();
    const isCompilerScene = openedScenePath && compilerDocument?.scenePath === openedScenePath;

    return (
        <main className="viewportSurface" aria-label={t('viewportLabel')}>
            <div className="viewportToolbar">
                <span>{isCompilerScene ? `${compilerDocument.template.name}.scene` : t('viewportLabel')}</span>
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
                    <div className="stageFrame">
                        {projectTree ? (
                            <CompilerSceneViewport document={compilerDocument} projectTree={projectTree} />
                        ) : (
                            <div className="panelEmptyState">
                                <strong>{compilerDocument.template.name}</strong>
                                <span>Project tree is required for Compiler Scene preview.</span>
                            </div>
                        )}
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
