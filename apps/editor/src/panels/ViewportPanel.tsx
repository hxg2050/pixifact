import type { EditorDocument } from '../../../../src';
import { PixifViewport } from '../preview/PixifViewport';
import { useDocumentRevision } from './common';

export function ViewportPanel({ document, revision }: { document: EditorDocument; revision: number }) {
    const liveRevision = useDocumentRevision();

    return (
        <main className="viewportSurface" aria-label="视口">
            <div className="viewportToolbar">
                <span>{document.prefab.name}.prefab</span>
                <div className="viewportActions">
                    <button type="button">100%</button>
                    <button type="button">适配</button>
                    <button type="button">网格</button>
                </div>
            </div>
            <section className="canvasWrap" aria-label="运行时画布" data-testid="viewport-stage">
                <div className="stageFrame">
                    <PixifViewport document={document} revision={Math.max(revision, liveRevision)} />
                </div>
            </section>
        </main>
    );
}
