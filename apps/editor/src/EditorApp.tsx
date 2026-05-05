import { useSyncExternalStore } from 'react';
import {
    getEditorDocument,
    getEditorDocumentRevision,
    subscribeEditorDocument,
} from './document/editorDocumentController';
import { IconButton } from './components/IconButton';
import { ExplorerPanel } from './panels/ExplorerPanel';
import { RightPanel } from './panels/RightPanel';
import { SummaryBar } from './panels/SummaryBar';
import { ViewportPanel } from './panels/ViewportPanel';

function useDocumentRevision() {
    return useSyncExternalStore(
        subscribeEditorDocument,
        getEditorDocumentRevision,
        getEditorDocumentRevision,
    );
}

export function EditorApp() {
    const revision = useDocumentRevision();
    const document = getEditorDocument();

    return (
        <div className="editorApp">
            <header className="appHeader">
                <div className="brandArea">
                    <span className="productMark" aria-hidden="true">P</span>
                    <h1>Pixif AI-first 游戏编辑器</h1>
                    <SummaryBar document={document} />
                </div>
                <div className="headerActions" aria-label="编辑器操作">
                    <IconButton icon="undo" label="撤销" onClick={() => document.undo()} disabled={!document.canUndo} />
                    <IconButton icon="redo" label="重做" onClick={() => document.redo()} disabled={!document.canRedo} />
                    <span className={document.dirty ? 'saveState dirty' : 'saveState'}>
                        {document.dirty ? '有未保存修改' : '已保存'}
                    </span>
                </div>
            </header>
            <div className="editorShell">
                <ExplorerPanel document={document} />
                <ViewportPanel document={document} revision={revision} />
                <RightPanel document={document} />
            </div>
        </div>
    );
}
