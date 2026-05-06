import { useMemo, useSyncExternalStore } from 'react';
import { DockviewReact } from 'dockview';
import type { DockviewReadyEvent, IDockviewPanelProps } from 'dockview';
import type { EditorDocument } from '../../../src';
import {
    getEditorDocument,
    getEditorDocumentRevision,
    subscribeEditorDocument,
} from './document/editorDocumentController';
import { IconButton } from './components/IconButton';
import { ResourceExplorer } from './panels/ExplorerPanel';
import { HierarchyTree } from './panels/HierarchyPanel';
import { AiPanel } from './panels/AiPanel';
import { InspectorPanel } from './panels/InspectorPanel';
import { SummaryBar } from './panels/SummaryBar';
import { ViewportPanel } from './panels/ViewportPanel';
import 'dockview/dist/styles/dockview.css';

function useDocumentRevision() {
    return useSyncExternalStore(
        subscribeEditorDocument,
        getEditorDocumentRevision,
        getEditorDocumentRevision,
    );
}

interface EditorPanelParams {
    document: EditorDocument;
    revision: number;
}

function createDockComponents(document: EditorDocument, revision: number) {
    const params: EditorPanelParams = { document, revision };

    return {
        fileSystem: (props: IDockviewPanelProps<EditorPanelParams>) => (
            <div className="dockPanelSurface">
                <ResourceExplorer {...props.params} document={params.document} />
            </div>
        ),
        prefabTree: (props: IDockviewPanelProps<EditorPanelParams>) => (
            <div className="dockPanelSurface">
                <section className="prefabMeta">
                    <span>预制体</span>
                    <strong>{params.document.prefab.name}</strong>
                    <small>{params.document.prefab.root.children?.length ?? 0} root children</small>
                </section>
                <HierarchyTree {...props.params} document={params.document} />
            </div>
        ),
        viewport: (props: IDockviewPanelProps<EditorPanelParams>) => (
            <ViewportPanel {...props.params} document={params.document} revision={params.revision} />
        ),
        inspector: (props: IDockviewPanelProps<EditorPanelParams>) => (
            <InspectorPanel
                {...props.params}
                document={params.document}
                model={params.document.getInspectorModel()}
            />
        ),
        ai: (props: IDockviewPanelProps<EditorPanelParams>) => (
            <AiPanel {...props.params} document={params.document} />
        ),
    };
}

function addInitialPanels(event: DockviewReadyEvent) {
    const fileSystem = event.api.addPanel({
        id: 'filesystem',
        component: 'fileSystem',
        title: '文件系统',
    });
    const prefabTree = event.api.addPanel({
        id: 'prefab',
        component: 'prefabTree',
        title: '预制体',
        position: { referencePanel: fileSystem, direction: 'right' },
    });
    const viewport = event.api.addPanel({
        id: 'viewport',
        component: 'viewport',
        title: 'Viewport',
        position: { referencePanel: prefabTree, direction: 'right' },
    });
    event.api.addPanel({
        id: 'inspector',
        component: 'inspector',
        title: 'Inspector',
        position: { referencePanel: viewport, direction: 'right' },
    });
    event.api.addPanel({
        id: 'ai',
        component: 'ai',
        title: 'AI 对话',
        position: { referencePanel: viewport, direction: 'below' },
    });
}

export function EditorApp() {
    const revision = useDocumentRevision();
    const document = getEditorDocument();
    const components = useMemo(() => createDockComponents(document, revision), [document, revision]);

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
            <div className="editorDockHost dockview-theme-light">
                <DockviewReact components={components} onReady={addInitialPanels} />
            </div>
        </div>
    );
}
