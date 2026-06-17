import { useCallback, useRef, useState } from 'react';
import { getCompilerSceneDocument } from '../document/compilerSceneDocumentController';
import { useEditorStore } from '../editorStore';
import { useI18n } from '../i18n';
import {
    CompilerSceneViewport,
    type CompilerSceneViewportHandle,
    type CompilerSceneViewportState,
} from '../preview/CompilerSceneViewport';
import { useCompilerSceneRevision } from './common';

function viewportStateLabel(state: CompilerSceneViewportState | undefined) {
    if (!state) {
        return '';
    }
    return `${state.scene.width}x${state.scene.height} · ${Math.round(state.scale * 100)}%`;
}

export function ViewportPanel() {
    useCompilerSceneRevision();
    const openedScenePath = useEditorStore((state) => state.openedScenePath);
    const projectTree = useEditorStore((state) => state.projectTree);
    const compilerDocument = getCompilerSceneDocument();
    const viewportRef = useRef<CompilerSceneViewportHandle | null>(null);
    const [viewportState, setViewportState] = useState<CompilerSceneViewportState | undefined>(undefined);
    const t = useI18n();
    const isCompilerScene = openedScenePath && compilerDocument?.scenePath === openedScenePath;
    const handleViewportStateChange = useCallback((state: CompilerSceneViewportState) => {
        setViewportState(state);
    }, []);

    return (
        <main className="viewportSurface" aria-label={t('viewportLabel')}>
            <div className="viewportToolbar">
                <div className="viewportTitle">
                    <strong>{isCompilerScene ? `${compilerDocument.template.name}.scene` : t('viewportLabel')}</strong>
                    {isCompilerScene ? <span>{viewportStateLabel(viewportState)}</span> : null}
                </div>
                {isCompilerScene ? (
                    <div className="viewportActions">
                        <button
                            disabled={!projectTree}
                            onClick={() => viewportRef.current?.setActualSize()}
                            type="button"
                        >
                            100%
                        </button>
                        <button
                            aria-pressed={viewportState?.mode === 'fit'}
                            disabled={!projectTree}
                            onClick={() => viewportRef.current?.fit()}
                            type="button"
                        >
                            {t('fit')}
                        </button>
                        <button
                            aria-pressed={viewportState?.gridVisible ?? false}
                            disabled={!projectTree}
                            onClick={() => viewportRef.current?.toggleGrid()}
                            type="button"
                        >
                            {t('grid')}
                        </button>
                    </div>
                ) : null}
            </div>
            <section className="canvasWrap" aria-label={t('runtimeCanvasLabel')} data-testid="viewport-stage">
                {isCompilerScene ? (
                    <div className="stageFrame">
                        {projectTree ? (
                            <CompilerSceneViewport
                                document={compilerDocument}
                                onStateChange={handleViewportStateChange}
                                projectTree={projectTree}
                                ref={viewportRef}
                            />
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
