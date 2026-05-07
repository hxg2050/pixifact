import { useCallback, useMemo, useState } from 'react';
import { DockviewReact } from 'dockview';
import type { DockviewReadyEvent, IDockviewPanelProps } from 'dockview';
import type { EditorDocument } from '../../../src';
import {
    getEditorDocument,
    refreshEditorDocument,
    resetEditorDocument,
} from './document/editorDocumentController';
import { IconButton } from './components/IconButton';
import { useEditorStore } from './editorStore';
import { ResourceExplorer } from './panels/ExplorerPanel';
import { HierarchyTree } from './panels/HierarchyPanel';
import { AiPanel } from './panels/AiPanel';
import { InspectorPanel } from './panels/InspectorPanel';
import { SummaryBar } from './panels/SummaryBar';
import { ViewportPanel } from './panels/ViewportPanel';
import { useDocumentRevision } from './panels/common';
import { openProjectFolder, savePrefabFile } from './services/projectFileTree';
import 'dockview/dist/styles/dockview.css';

interface EditorPanelParams {
    document: EditorDocument;
    revision: number;
}

function createDockComponents(document: EditorDocument, revision: number) {
    const params: EditorPanelParams = { document, revision };

    return {
        fileSystem: (props: IDockviewPanelProps<EditorPanelParams>) => (
            <div className="dockPanelSurface">
                <ResourceExplorer {...props.params} document={params.document} revision={params.revision} />
            </div>
        ),
        prefabTree: (props: IDockviewPanelProps<EditorPanelParams>) => (
            <PrefabTreePanel {...props.params} document={params.document} />
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

function PrefabTreePanel({ document }: { document: EditorDocument }) {
    useDocumentRevision();

    return (
        <div className="dockPanelSurface">
            <section className="resourceMeta">
                <span>预制体</span>
                <strong>{document.prefab.name}</strong>
                <small>{document.prefab.root.children?.length ?? 0} root children</small>
            </section>
            <HierarchyTree document={document} />
        </div>
    );
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
    const setProject = useEditorStore((state) => state.setProject);
    const projectTree = useEditorStore((state) => state.projectTree);
    const openedPrefabPath = useEditorStore((state) => state.openedPrefabPath);
    const [saveStatus, setSaveStatus] = useState('未打开项目文件夹');
    const components = useMemo(() => createDockComponents(document, revision), [document, revision]);
    const resetDocument = useCallback(() => {
        resetEditorDocument();
    }, []);
    const undo = useCallback(() => {
        document.undo();
        refreshEditorDocument();
    }, [document]);
    const redo = useCallback(() => {
        document.redo();
        refreshEditorDocument();
    }, [document]);
    const openFolder = useCallback(async () => {
        const tree = await openProjectFolder();
        if (tree) {
            setProject(tree);
            setSaveStatus('项目文件树已读取');
        }
    }, [setProject]);
    const savePrefab = useCallback(async () => {
        if (!projectTree) {
            setSaveStatus('未打开项目文件夹');
            return;
        }
        if (!openedPrefabPath) {
            setSaveStatus('未打开 Prefab');
            return;
        }

        const saved = await savePrefabFile(projectTree, openedPrefabPath, document);
        if (saved) {
            setSaveStatus(`已保存 ${openedPrefabPath.split('/').pop()}`);
            refreshEditorDocument();
        }
    }, [document, openedPrefabPath, projectTree]);

    return (
        <div className="app">
            <header className="topbar">
                <div className="brand">
                    <span className="mark" aria-hidden="true">P</span>
                    <div>
                        <strong>Pixifact Editor</strong>
                        <small>Dockview prototype · 只保留 Prefab 资源模型</small>
                    </div>
                </div>
                <div className="statusBar">
                    <span>{document.prefab.name}.prefab</span>
                    <span>{document.dirty ? '有未保存修改' : '已保存'}</span>
                    <span data-testid="save-status">{saveStatus}</span>
                    <span>AI Ready</span>
                    <SummaryBar document={document} />
                </div>
                <div className="topActions" aria-label="编辑器操作">
                    <IconButton icon="undo" label="撤销" onClick={undo} disabled={!document.canUndo} />
                    <IconButton icon="redo" label="重做" onClick={redo} disabled={!document.canRedo} />
                    <button onClick={() => void openFolder()} type="button">打开文件夹</button>
                    <button onClick={resetDocument} type="button">重置模拟</button>
                    <button onClick={() => void savePrefab()} type="button">保存</button>
                    <button type="button">预览</button>
                    <button className="primary" type="button">运行</button>
                </div>
            </header>
            <main className="dockHost dockview-theme-light">
                <DockviewReact components={components} onReady={addInitialPanels} />
            </main>
        </div>
    );
}
