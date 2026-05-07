import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DockviewReact } from 'dockview';
import type { DockviewApi, DockviewReadyEvent, IDockviewPanelProps } from 'dockview';
import type { EditorDocument } from '../../../src';
import {
    getEditorDocument,
    refreshEditorDocument,
    resetEditorDocument,
} from './document/editorDocumentController';
import { IconButton } from './components/IconButton';
import { Select } from './components/system';
import { useEditorStore } from './editorStore';
import type { EditorLanguage } from './i18n';
import { editorLanguageNames, translate, useI18n } from './i18n';
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

function dockPanelTitles(language: EditorLanguage) {
    return {
        fileSystem: translate(language, 'panelFileSystem'),
        prefabTree: translate(language, 'panelPrefab'),
        viewport: translate(language, 'viewportLabel'),
        inspector: 'Inspector',
        ai: translate(language, 'panelAi'),
    };
}

function setDockPanelTitles(api: DockviewApi, language: EditorLanguage) {
    const titles = dockPanelTitles(language);
    api.getPanel('filesystem')?.api.setTitle(titles.fileSystem);
    api.getPanel('prefab')?.api.setTitle(titles.prefabTree);
    api.getPanel('viewport')?.api.setTitle(titles.viewport);
    api.getPanel('inspector')?.api.setTitle(titles.inspector);
    api.getPanel('ai')?.api.setTitle(titles.ai);
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
    const t = useI18n();

    return (
        <div className="dockPanelSurface">
            <section className="resourceMeta">
                <span>{t('panelPrefab')}</span>
                <strong>{document.prefab.name}</strong>
                <small>{t('rootChildren', { count: document.prefab.root.children?.length ?? 0 })}</small>
            </section>
            <HierarchyTree document={document} />
        </div>
    );
}

function addInitialPanels(event: DockviewReadyEvent, language: EditorLanguage) {
    const titles = dockPanelTitles(language);
    const fileSystem = event.api.addPanel({
        id: 'filesystem',
        component: 'fileSystem',
        title: titles.fileSystem,
    });
    const prefabTree = event.api.addPanel({
        id: 'prefab',
        component: 'prefabTree',
        title: titles.prefabTree,
        position: { referencePanel: fileSystem, direction: 'right' },
    });
    const viewport = event.api.addPanel({
        id: 'viewport',
        component: 'viewport',
        title: titles.viewport,
        position: { referencePanel: prefabTree, direction: 'right' },
    });
    event.api.addPanel({
        id: 'inspector',
        component: 'inspector',
        title: titles.inspector,
        position: { referencePanel: viewport, direction: 'right' },
    });
    event.api.addPanel({
        id: 'ai',
        component: 'ai',
        title: titles.ai,
        position: { referencePanel: viewport, direction: 'below' },
    });
}

export function EditorApp() {
    const revision = useDocumentRevision();
    const document = getEditorDocument();
    const t = useI18n();
    const language = useEditorStore((state) => state.language);
    const setLanguage = useEditorStore((state) => state.setLanguage);
    const setProject = useEditorStore((state) => state.setProject);
    const projectTree = useEditorStore((state) => state.projectTree);
    const openedPrefabPath = useEditorStore((state) => state.openedPrefabPath);
    const dockApiRef = useRef<DockviewApi | undefined>(undefined);
    const [saveStatusKey, setSaveStatusKey] = useState<'closed' | 'treeLoaded' | 'noPrefab' | 'savedFile'>('closed');
    const [savedFileName, setSavedFileName] = useState('');
    const components = useMemo(() => createDockComponents(document, revision), [document, revision]);
    const saveStatus = useMemo(() => {
        switch (saveStatusKey) {
            case 'treeLoaded':
                return t('saveStatusTreeLoaded');
            case 'noPrefab':
                return t('saveStatusNoPrefab');
            case 'savedFile':
                return t('saveStatusSavedFile', { file: savedFileName });
            case 'closed':
                return t('saveStatusClosed');
        }
    }, [saveStatusKey, savedFileName, t]);

    useEffect(() => {
        if (dockApiRef.current) {
            setDockPanelTitles(dockApiRef.current, language);
        }
    }, [language]);

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
            setSaveStatusKey('treeLoaded');
        }
    }, [setProject]);
    const savePrefab = useCallback(async () => {
        if (!projectTree) {
            setSaveStatusKey('closed');
            return;
        }
        if (!openedPrefabPath) {
            setSaveStatusKey('noPrefab');
            return;
        }

        const saved = await savePrefabFile(projectTree, openedPrefabPath, document);
        if (saved) {
            setSavedFileName(openedPrefabPath.split('/').pop() ?? openedPrefabPath);
            setSaveStatusKey('savedFile');
            refreshEditorDocument();
        }
    }, [document, openedPrefabPath, projectTree]);

    const handleDockReady = useCallback((event: DockviewReadyEvent) => {
        dockApiRef.current = event.api;
        addInitialPanels(event, language);
    }, [language]);

    return (
        <div className="app">
            <header className="topbar">
                <div className="brand">
                    <span className="mark" aria-hidden="true">P</span>
                    <div>
                        <strong>Pixifact Editor</strong>
                        <small>{t('appTagline')}</small>
                    </div>
                </div>
                <div className="statusBar">
                    <span>{document.prefab.name}.prefab</span>
                    <span>{document.dirty ? t('dirtyUnsaved') : t('saved')}</span>
                    <span data-testid="save-status">{saveStatus}</span>
                    <span>AI Ready</span>
                    <SummaryBar document={document} />
                </div>
                <div className="topActions" aria-label={t('topActionsLabel')}>
                    <IconButton icon="undo" label={t('undo')} onClick={undo} disabled={!document.canUndo} />
                    <IconButton icon="redo" label={t('redo')} onClick={redo} disabled={!document.canRedo} />
                    <button onClick={() => void openFolder()} type="button">{t('openFolder')}</button>
                    <button onClick={resetDocument} type="button">{t('resetMock')}</button>
                    <button onClick={() => void savePrefab()} type="button">{t('save')}</button>
                    <button type="button">{t('preview')}</button>
                    <button className="primary" type="button">{t('run')}</button>
                    <Select
                        aria-label={t('language')}
                        className="languageSelect"
                        onSelectionChange={(key) => setLanguage(key as EditorLanguage)}
                        options={(Object.keys(editorLanguageNames) as EditorLanguage[]).map((key) => ({
                            label: editorLanguageNames[key],
                            value: key,
                        }))}
                        selectedKey={language}
                    />
                </div>
            </header>
            <main className="dockHost dockview-theme-light">
                <DockviewReact components={components} onReady={handleDockReady} />
            </main>
        </div>
    );
}
