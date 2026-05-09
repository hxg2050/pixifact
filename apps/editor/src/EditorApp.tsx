import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DockviewReact, themeLight } from 'dockview';
import type { DockviewApi, DockviewReadyEvent, IDockviewPanelProps } from 'dockview';
import type { SceneDocument } from 'pixifact';
import {
    getSceneDocument,
    refreshSceneDocument,
    resetSceneDocument,
} from './document/sceneDocumentController';
import { IconButton } from './components/IconButton';
import { Button, Select, SystemIcon } from './components/system';
import { useEditorStore } from './editorStore';
import type { EditorLanguage } from './i18n';
import { editorLanguageNames, translate, useI18n } from './i18n';
import { ResourceExplorer } from './panels/ExplorerPanel';
import { HierarchyTree } from './panels/HierarchyPanel';
import { AiPanel } from './panels/AiPanel';
import { InspectorPanel } from './panels/InspectorPanel';
import { SummaryBar } from './panels/SummaryBar';
import { ViewportPanel } from './panels/ViewportPanel';
import { collectHierarchy, useDocumentRevision } from './panels/common';
import { openProjectFolder, saveSceneFile } from './services/projectFileTree';
import { startLiveEditorMcpClient } from './mcp/liveEditorClient';
import { pixifactMcpBridgeUrl } from './mcp/liveBridge';
import 'dockview/dist/styles/dockview.css';

interface EditorPanelParams {
    document: SceneDocument;
    revision: number;
}

function dockPanelTitles(language: EditorLanguage) {
    return {
        fileSystem: translate(language, 'panelFileSystem'),
        sceneTree: translate(language, 'panelScene'),
        viewport: translate(language, 'viewportLabel'),
        inspector: 'Inspector',
        ai: translate(language, 'panelAi'),
    };
}

function setDockPanelTitles(api: DockviewApi, language: EditorLanguage) {
    const titles = dockPanelTitles(language);
    api.getPanel('filesystem')?.api.setTitle(titles.fileSystem);
    api.getPanel('scene')?.api.setTitle(titles.sceneTree);
    api.getPanel('viewport')?.api.setTitle(titles.viewport);
    api.getPanel('inspector')?.api.setTitle(titles.inspector);
    api.getPanel('ai')?.api.setTitle(titles.ai);
}

function setInitialDockLayout(api: DockviewApi) {
    api.getPanel('filesystem')?.group.api.setSize({ width: 280 });
    api.getPanel('scene')?.group.api.setSize({ width: 300 });
    api.getPanel('inspector')?.group.api.setSize({ width: 360 });
    api.getPanel('ai')?.group.api.setSize({ height: 220 });
}

function createDockComponents(document: SceneDocument, revision: number) {
    const params: EditorPanelParams = { document, revision };

    return {
        fileSystem: (props: IDockviewPanelProps<EditorPanelParams>) => (
            <div className="dockPanelSurface">
                <ResourceExplorer {...props.params} document={params.document} revision={params.revision} />
            </div>
        ),
        sceneTree: (props: IDockviewPanelProps<EditorPanelParams>) => (
            <SceneTreePanel {...props.params} document={params.document} />
        ),
        viewport: (props: IDockviewPanelProps<EditorPanelParams>) => (
            <ViewportPanel {...props.params} document={params.document} revision={params.revision} />
        ),
        inspector: (props: IDockviewPanelProps<EditorPanelParams>) => (
            <InspectorPanel {...props.params} document={params.document} />
        ),
        ai: () => <AiPanel />,
    };
}

function SceneTreePanel({ document }: { document: SceneDocument }) {
    useDocumentRevision();
    const t = useI18n();
    const openedScenePath = useEditorStore((state) => state.openedScenePath);
    if (!openedScenePath) {
        return (
            <div className="dockPanelSurface panelEmptyState">
                <strong>{t('sceneEmptyTitle')}</strong>
                <span>{t('sceneEmptyHint')}</span>
            </div>
        );
    }
    const hierarchy = collectHierarchy(document.scene.root);
    const componentCount = hierarchy.reduce((total, item) => total + (item.node.components?.length ?? 0), 0);

    return (
        <div className="dockPanelSurface">
            <section className="resourceMeta">
                <span>{t('panelScene')}</span>
                <strong>{document.scene.name}</strong>
                <small title={openedScenePath ?? t('unboundSceneFile')}>{openedScenePath ?? t('unboundSceneFile')}</small>
                <div className="sceneMetaGrid">
                    <span>{t('nodeCount', { count: hierarchy.length })}</span>
                    <span>{t('componentCount', { count: componentCount })}</span>
                    <span className={document.dirty ? 'sceneState dirty' : 'sceneState saved'}>{document.dirty ? t('dirtyUnsaved') : t('saved')}</span>
                </div>
            </section>
            <HierarchyTree document={document} />
        </div>
    );
}

function WelcomePage({ onOpenFolder }: { onOpenFolder: () => void }) {
    const t = useI18n();

    return (
        <section className="welcomePage" aria-labelledby="welcome-title" data-testid="welcome-page">
            <div className="welcomeCard">
                <span className="welcomeMark" aria-hidden="true">P</span>
                <div className="welcomeCopy">
                    <p>{t('project')}</p>
                    <h1 id="welcome-title">{t('projectNotOpened')}</h1>
                    <span>{t('projectOpenHint')}</span>
                    <small>{t('projectOpenRule')}</small>
                </div>
                <Button icon="folder-open" onPress={onOpenFolder} variant="primary">
                    {t('openFolder')}
                </Button>
            </div>
        </section>
    );
}

function addInitialPanels(event: DockviewReadyEvent, language: EditorLanguage) {
    const titles = dockPanelTitles(language);
    const fileSystem = event.api.addPanel({
        id: 'filesystem',
        component: 'fileSystem',
        title: titles.fileSystem,
        initialWidth: 280,
        minimumWidth: 220,
    });
    const sceneTree = event.api.addPanel({
        id: 'scene',
        component: 'sceneTree',
        title: titles.sceneTree,
        initialWidth: 300,
        minimumWidth: 240,
        position: { referencePanel: fileSystem, direction: 'right' },
    });
    const viewport = event.api.addPanel({
        id: 'viewport',
        component: 'viewport',
        title: titles.viewport,
        minimumWidth: 420,
        position: { referencePanel: sceneTree, direction: 'right' },
    });
    event.api.addPanel({
        id: 'inspector',
        component: 'inspector',
        title: titles.inspector,
        initialWidth: 360,
        minimumWidth: 300,
        position: { referencePanel: viewport, direction: 'right' },
    });
    event.api.addPanel({
        id: 'ai',
        component: 'ai',
        title: titles.ai,
        initialHeight: 220,
        minimumHeight: 160,
        position: { referencePanel: viewport, direction: 'below' },
    });
}

export function EditorApp() {
    const revision = useDocumentRevision();
    const document = getSceneDocument();
    const t = useI18n();
    const language = useEditorStore((state) => state.language);
    const setLanguage = useEditorStore((state) => state.setLanguage);
    const setProject = useEditorStore((state) => state.setProject);
    const projectTree = useEditorStore((state) => state.projectTree);
    const openedScenePath = useEditorStore((state) => state.openedScenePath);
    const dockApiRef = useRef<DockviewApi | undefined>(undefined);
    const [saveStatusKey, setSaveStatusKey] = useState<'closed' | 'treeLoaded' | 'noScene' | 'savedFile'>('closed');
    const [savedFileName, setSavedFileName] = useState('');
    const components = useMemo(() => createDockComponents(document, revision), [document, revision]);
    const hasProject = Boolean(projectTree);
    const saveStatus = useMemo(() => {
        switch (saveStatusKey) {
            case 'treeLoaded':
                return t('saveStatusTreeLoaded');
            case 'noScene':
                return t('saveStatusNoScene');
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

    useEffect(() => startLiveEditorMcpClient(), []);

    const resetDocument = useCallback(() => {
        resetSceneDocument();
    }, []);
    const undo = useCallback(() => {
        document.undo();
        refreshSceneDocument();
    }, [document]);
    const redo = useCallback(() => {
        document.redo();
        refreshSceneDocument();
    }, [document]);
    const openFolder = useCallback(async () => {
        const tree = await openProjectFolder();
        if (tree) {
            setProject(tree);
            setSaveStatusKey('treeLoaded');
        }
    }, [setProject]);
    const saveScene = useCallback(async () => {
        if (!projectTree) {
            setSaveStatusKey('closed');
            return;
        }
        if (!openedScenePath) {
            setSaveStatusKey('noScene');
            return;
        }

        const saved = await saveSceneFile(projectTree, openedScenePath, document);
        if (saved) {
            setSavedFileName(openedScenePath.split('/').pop() ?? openedScenePath);
            setSaveStatusKey('savedFile');
            refreshSceneDocument();
        }
    }, [document, openedScenePath, projectTree]);

    const handleDockReady = useCallback((event: DockviewReadyEvent) => {
        dockApiRef.current = event.api;
        addInitialPanels(event, language);
        window.requestAnimationFrame(() => setInitialDockLayout(event.api));
    }, [language]);
    const topStatus = hasProject ? (
        <>
            <span>{document.scene.name}.scene</span>
            <span className={document.dirty ? 'statusPill dirty' : 'statusPill saved'}>{document.dirty ? t('dirtyUnsaved') : t('saved')}</span>
            <span data-testid="save-status">{saveStatus}</span>
            <span>AI Ready</span>
            <SummaryBar document={document} />
        </>
    ) : (
        <>
            <span>{t('projectNotOpened')}</span>
            <span data-testid="save-status">{t('saveStatusClosed')}</span>
            <span>{t('agentProjectNotOpened')}</span>
        </>
    );

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
                    {topStatus}
                </div>
                <div className="topActions" aria-label={t('topActionsLabel')}>
                    {hasProject ? (
                        <div className="topActionGroup">
                            <IconButton icon="undo" label={t('undo')} onClick={undo} disabled={!document.canUndo} />
                            <IconButton icon="redo" label={t('redo')} onClick={redo} disabled={!document.canRedo} />
                        </div>
                    ) : null}
                    <div className="topActionGroup">
                        <Button icon="folder-open" onPress={() => void openFolder()}>{t('openFolder')}</Button>
                        {hasProject ? (
                            <>
                                <Button icon="save" onPress={() => void saveScene()}>{t('save')}</Button>
                                <Button icon="reset" onPress={resetDocument}>{t('resetMock')}</Button>
                            </>
                        ) : null}
                    </div>
                    {hasProject ? (
                        <div className="topActionGroup">
                            <Button icon="eye">{t('preview')}</Button>
                            <Button icon="play" variant="primary">{t('run')}</Button>
                        </div>
                    ) : null}
                    <div className="languageControl">
                        <SystemIcon name="languages" />
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
                </div>
            </header>
            <main className={hasProject ? 'dockHost dockview-theme-light' : 'welcomeHost'}>
                {hasProject ? (
                    <DockviewReact components={components} onReady={handleDockReady} theme={themeLight} />
                ) : (
                    <WelcomePage onOpenFolder={() => void openFolder()} />
                )}
            </main>
            <footer className="mcpStatusBar" aria-label={t('agentStatusTitle')} data-testid="mcp-status-bar">
                <div>
                    <span>{t('agentBridge')}</span>
                    <strong>bun run editor:mcp</strong>
                    <small>{pixifactMcpBridgeUrl}</small>
                </div>
                <div>
                    <span>{t('agentEditorTarget')}</span>
                    <strong>{document.scene.name}</strong>
                    <small>{openedScenePath ?? t('unboundSceneFile')}</small>
                </div>
                <div>
                    <span>{t('agentProjectState')}</span>
                    <strong>{projectTree ? t('agentProjectOpened') : t('agentProjectNotOpened')}</strong>
                    <small>{projectTree?.projectRootPath ?? projectTree?.path ?? t('projectOpenHint')}</small>
                </div>
            </footer>
        </div>
    );
}
