import type { EditorDocument } from '../../../../src';
import { PixifViewport } from '../preview/PixifViewport';

export function ViewportPanel({ document, revision }: { document: EditorDocument; revision: number }) {
    return (
        <main className="viewportPanel" aria-label="视口">
            <div className="viewportToolbar">
                <span>运行时视口</span>
                <div className="viewportActions">
                    <span>16:9</span>
                    <span>实时预览</span>
                </div>
            </div>
            <section className="viewportStage" aria-label="运行时画布" data-testid="viewport-stage">
                <div className="stageFrame">
                    <PixifViewport document={document} revision={revision} />
                </div>
            </section>
        </main>
    );
}
