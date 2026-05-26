import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DockviewReact, themeLight } from 'dockview';
import type { DockviewApi, DockviewReadyEvent, IDockviewPanelProps } from 'dockview';
import {
    getCompilerSceneDocument,
    resetCompilerSceneDocument,
} from './document/compilerSceneDocumentController';
import { IconButton } from './components/IconButton';
import { Button, Select, SystemIcon } from './components/system';
import { useEditorStore } from './editorStore';
import type { EditorLanguage } from './i18n';
import { editorLanguageNames, translate, useI18n } from './i18n';
import { ResourceExplorer } from './panels/ExplorerPanel';
import { CompilerSceneHierarchyTree } from './panels/HierarchyPanel';
import { AgentPanel } from './panels/AgentPanel';
import { InspectorPanel } from './panels/InspectorPanel';
import { SummaryBar } from './panels/SummaryBar';
import { ViewportPanel } from './panels/ViewportPanel';
import { useCompilerSceneRevision } from './panels/common';
import {
    openProjectFolder,
    saveCompilerSceneFile,
} from './services/projectFileTree';
import type { CompilerSceneTemplateNode } from './services/projectFileTree';
import {
    compileCompilerScenes,
    createReadyRunStatus,
    refreshEditorRunStatus,
    startEditorRun,
    stopEditorRun,
} from './services/editorRunService';
import type { EditorRunStatus } from './services/editorRunService';
import { startLiveEditorAgentClient } from './agent/liveEditorClient';
import { pixifactAgentBridgeUrl } from './agent/liveBridge';
import { listenHostProjectFileChanged } from './services/hostBridge';
import { syncOpenedCompilerSceneFromHostChange } from './services/compilerSceneExternalSync';
import type { CompilerSceneExternalSyncResult } from './services/compilerSceneExternalSync';
import 'dockview/dist/styles/dockview.css';

type EditorPanelParams = Record<string, never>;
type ExternalSceneSyncStatus = { message: string; tone: 'saved' | 'dirty' };

function dockPanelTitles(language: EditorLanguage) {
    return {
        fileSystem: translate(language, 'panelFileSystem'),
        sceneTree: translate(language, 'panelScene'),
        viewport: translate(language, 'viewportLabel'),
        inspector: 'Inspector',
        agent: translate(language, 'panelAgent'),
    };
}

function setDockPanelTitles(api: DockviewApi, language: EditorLanguage) {
    const titles = dockPanelTitles(language);
    api.getPanel('filesystem')?.api.setTitle(titles.fileSystem);
    api.getPanel('scene')?.api.setTitle(titles.sceneTree);
    api.getPanel('viewport')?.api.setTitle(titles.viewport);
    api.getPanel('inspector')?.api.setTitle(titles.inspector);
    api.getPanel('agent')?.api.setTitle(titles.agent);
}

function setInitialDockLayout(api: DockviewApi) {
    api.getPanel('filesystem')?.group.api.setSize({ width: 280 });
    api.getPanel('scene')?.group.api.setSize({ width: 300 });
    api.getPanel('inspector')?.group.api.setSize({ width: 360 });
    api.getPanel('agent')?.group.api.setSize({ height: 220 });
}

function createDockComponents() {
    return {
        fileSystem: (_props: IDockviewPanelProps<EditorPanelParams>) => (
            <div className="dockPanelSurface">
                <ResourceExplorer />
            </div>
        ),
        sceneTree: (_props: IDockviewPanelProps<EditorPanelParams>) => (
            <SceneTreePanel />
        ),
        viewport: (_props: IDockviewPanelProps<EditorPanelParams>) => (
            <ViewportPanel />
        ),
        inspector: (_props: IDockviewPanelProps<EditorPanelParams>) => (
            <InspectorPanel />
        ),
        agent: () => <AgentPanel />,
    };
}

function SceneTreePanel() {
    useCompilerSceneRevision();
    const t = useI18n();
    const openedScenePath = useEditorStore((state) => state.openedScenePath);
    const compilerDocument = getCompilerSceneDocument();
    if (!openedScenePath || compilerDocument?.scenePath !== openedScenePath) {
        return (
            <div className="dockPanelSurface panelEmptyState">
                <strong>{t('sceneEmptyTitle')}</strong>
                <span>{t('sceneEmptyHint')}</span>
            </div>
        );
    }
    const nodeCount = countCompilerSceneNodes(compilerDocument.template.children);
    const publicInterface = compilerDocument.descriptor?.interface ?? compilerDocument.template.interface;

    return (
        <div className="dockPanelSurface">
            <section className="resourceMeta">
                <span>{t('panelScene')}</span>
                <strong>{compilerDocument.template.name}</strong>
                <small title={openedScenePath}>{openedScenePath}</small>
                <div className="sceneMetaGrid">
                    <span>{t('nodeCount', { count: nodeCount })}</span>
                    <span>{Object.keys(publicInterface.props).length} props</span>
                    <span>{Object.keys(publicInterface.events).length} events</span>
                    <span>{Object.keys(publicInterface.slots).length} slots</span>
                    <span className={compilerDocument.dirty ? 'sceneState dirty' : 'sceneState saved'}>{compilerDocument.dirty ? t('dirtyUnsaved') : t('saved')}</span>
                </div>
            </section>
            <CompilerSceneHierarchyTree />
        </div>
    );
}

function countCompilerSceneNodes(nodes: readonly CompilerSceneTemplateNode[]): number {
    let count = 1;
    for (const node of nodes) {
        count += 1;
        if (node.kind === 'pixi') {
            count += countCompilerSceneNodes(node.children) - 1;
        }
        if (node.kind === 'sceneInstance') {
            for (const children of Object.values(node.slots)) {
                count += countCompilerSceneNodes(children) - 1;
            }
        }
    }
    return count;
}

function externalSceneSyncStatus(result: CompilerSceneExternalSyncResult): ExternalSceneSyncStatus | undefined {
    if (!('message' in result)) {
        return undefined;
    }
    return {
        message: result.message,
        tone: result.status === 'sceneReloaded' ? 'saved' : 'dirty',
    };
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
        id: 'agent',
        component: 'agent',
        title: titles.agent,
        initialHeight: 220,
        minimumHeight: 160,
        position: { referencePanel: viewport, direction: 'below' },
    });
}

export function EditorApp() {
    useCompilerSceneRevision();
    const t = useI18n();
    const language = useEditorStore((state) => state.language);
    const setLanguage = useEditorStore((state) => state.setLanguage);
    const setProject = useEditorStore((state) => state.setProject);
    const projectTree = useEditorStore((state) => state.projectTree);
    const openedScenePath = useEditorStore((state) => state.openedScenePath);
    const dockApiRef = useRef<DockviewApi | undefined>(undefined);
    const [saveStatusKey, setSaveStatusKey] = useState<'closed' | 'treeLoaded' | 'noScene' | 'savedFile' | 'compiledFile' | 'compileFailed'>('closed');
    const [savedFileName, setSavedFileName] = useState('');
    const [saveError, setSaveError] = useState('');
    const [externalSceneSyncStatusState, setExternalSceneSyncStatusState] = useState<ExternalSceneSyncStatus | undefined>();
    const [runStatus, setRunStatus] = useState<EditorRunStatus>({
        state: 'unconfigured',
        stdout: [],
        stderr: [],
    });
    const components = useMemo(() => createDockComponents(), []);
    const hasProject = Boolean(projectTree);
    const compilerDocument = getCompilerSceneDocument();
    const compilerSceneOpened = openedScenePath && compilerDocument?.scenePath === openedScenePath;
    const currentSceneDirty = compilerSceneOpened ? compilerDocument.dirty : false;
    const currentSceneName = compilerSceneOpened ? compilerDocument.template.name : t('sceneEmptyTitle');
    const saveStatus = useMemo(() => {
        switch (saveStatusKey) {
            case 'treeLoaded':
                return t('saveStatusTreeLoaded');
            case 'noScene':
                return t('saveStatusNoScene');
            case 'savedFile':
                return t('saveStatusSavedFile', { file: savedFileName });
            case 'compiledFile':
                return t('saveStatusCompiledFile', { file: savedFileName });
            case 'compileFailed':
                return t('saveStatusCompileFailed', { error: saveError });
            case 'closed':
                return t('saveStatusClosed');
        }
    }, [saveStatusKey, savedFileName, saveError, t]);

    useEffect(() => {
        if (dockApiRef.current) {
            setDockPanelTitles(dockApiRef.current, language);
        }
    }, [language]);

    useEffect(() => startLiveEditorAgentClient(), []);

    useEffect(() => {
        if (!projectTree) {
            setRunStatus({
                state: 'unconfigured',
                stdout: [],
                stderr: [],
            });
            return;
        }
        void createReadyRunStatus(projectTree)
            .then(setRunStatus)
            .catch((error) => setRunStatus({
                state: 'failed',
                error: error instanceof Error ? error.message : String(error),
                stdout: [],
                stderr: [],
            }));
    }, [projectTree]);

    useEffect(() => {
        let unsubscribe: (() => void) | undefined;
        let cancelled = false;

        void listenHostProjectFileChanged(async (event) => {
            const currentProjectTree = useEditorStore.getState().projectTree;
            const currentScenePath = useEditorStore.getState().openedScenePath;
            try {
                const result = await syncOpenedCompilerSceneFromHostChange({
                    projectTree: currentProjectTree,
                    openedScenePath: currentScenePath,
                    event,
                });
                setExternalSceneSyncStatusState(externalSceneSyncStatus(result));
            } catch (error) {
                setExternalSceneSyncStatusState({
                    message: error instanceof Error ? error.message : String(error),
                    tone: 'dirty',
                });
            }
        }).then((dispose) => {
            if (cancelled) {
                dispose();
                return;
            }
            unsubscribe = dispose;
        }).catch((error) => {
            if (!cancelled) {
                setExternalSceneSyncStatusState({
                    message: error instanceof Error ? error.message : String(error),
                    tone: 'dirty',
                });
            }
        });

        return () => {
            cancelled = true;
            unsubscribe?.();
        };
    }, []);

    useEffect(() => {
        if (!runStatus.sessionId || !['starting', 'running'].includes(runStatus.state)) {
            return;
        }
        const interval = window.setInterval(() => {
            void refreshEditorRunStatus(runStatus)
                .then(setRunStatus)
                .catch((error) => setRunStatus((current) => ({
                    ...current,
                    state: 'failed',
                    error: error instanceof Error ? error.message : String(error),
                })));
        }, 1200);
        return () => window.clearInterval(interval);
    }, [runStatus]);

    const resetDocument = useCallback(() => {
        resetCompilerSceneDocument();
    }, []);
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
        const compilerDocument = getCompilerSceneDocument();
        if (!openedScenePath || compilerDocument?.scenePath !== openedScenePath) {
            setSaveStatusKey('noScene');
            return;
        }
        const saved = await saveCompilerSceneFile(projectTree, openedScenePath, compilerDocument);
        if (saved) {
            setSavedFileName(openedScenePath.split('/').pop() ?? openedScenePath);
            try {
                await compileCompilerScenes(projectTree);
                setSaveStatusKey('compiledFile');
            } catch (error) {
                setSaveError(error instanceof Error ? error.message : String(error));
                setSaveStatusKey('compileFailed');
            }
        }
    }, [openedScenePath, projectTree]);
    const runProject = useCallback(async () => {
        if (!projectTree) {
            return;
        }
        try {
            setRunStatus((current) => ({
                ...current,
                state: 'starting',
                error: undefined,
            }));
            setRunStatus(await startEditorRun(projectTree, currentSceneDirty));
        } catch (error) {
            setRunStatus((current) => ({
                ...current,
                state: 'failed',
                error: error instanceof Error ? error.message : String(error),
            }));
        }
    }, [currentSceneDirty, projectTree]);
    const stopRun = useCallback(async () => {
        try {
            setRunStatus(await stopEditorRun(runStatus));
        } catch (error) {
            setRunStatus((current) => ({
                ...current,
                state: 'failed',
                error: error instanceof Error ? error.message : String(error),
            }));
        }
    }, [runStatus]);

    const handleDockReady = useCallback((event: DockviewReadyEvent) => {
        dockApiRef.current = event.api;
        addInitialPanels(event, language);
        window.requestAnimationFrame(() => setInitialDockLayout(event.api));
    }, [language]);
    const topStatus = hasProject ? (
        <>
            <span>{compilerSceneOpened ? `${currentSceneName}.scene` : currentSceneName}</span>
            <span className={currentSceneDirty ? 'statusPill dirty' : 'statusPill saved'}>{currentSceneDirty ? t('dirtyUnsaved') : t('saved')}</span>
            <span data-testid="save-status">{saveStatus}</span>
            {externalSceneSyncStatusState ? (
                <span className={`statusPill ${externalSceneSyncStatusState.tone}`}>Sync: {externalSceneSyncStatusState.message}</span>
            ) : null}
            <span>{t(`runState_${runStatus.state}`)}</span>
            <span>Agent Bridge</span>
            <SummaryBar />
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
                            <IconButton icon="undo" label={t('undo')} disabled />
                            <IconButton icon="redo" label={t('redo')} disabled />
                        </div>
                    ) : null}
                    <div className="topActionGroup">
                        <Button icon="folder-open" onPress={() => void openFolder()}>{t('openFolder')}</Button>
                        {hasProject ? (
                            <>
                                <Button icon="save" onPress={() => void saveScene()}>{t('save')}</Button>
                                <Button icon="reset" onPress={resetDocument}>{t('resetDemo')}</Button>
                            </>
                        ) : null}
                    </div>
                    {hasProject ? (
                        <div className="topActionGroup">
                            <Button icon="eye">{t('preview')}</Button>
                            {runStatus.state === 'running' || runStatus.state === 'starting' ? (
                                <Button icon="square" onPress={() => void stopRun()} variant="danger">{t('stopRun')}</Button>
                            ) : (
                                <Button
                                    disabled={runStatus.state === 'unconfigured'}
                                    icon="play"
                                    onPress={() => void runProject()}
                                    variant="primary"
                                >
                                    {t('run')}
                                </Button>
                            )}
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
            <footer className="agentStatusBar" aria-label={t('agentStatusTitle')} data-testid="agent-status-bar">
                <div>
                    <span>{t('runStatusTitle')}</span>
                    <strong>{t(`runState_${runStatus.state}`)}</strong>
                    <small>{runStatus.error ?? runStatus.stderr.at(-1) ?? runStatus.stdout.at(-1) ?? runStatus.command ?? t('runLogEmpty')}</small>
                </div>
                <div>
                    <span>{t('agentBridge')}</span>
                    <strong>bun run pixifact -- live</strong>
                    <small>{pixifactAgentBridgeUrl}</small>
                </div>
                <div>
                    <span>{t('agentEditorTarget')}</span>
                    <strong>{currentSceneName}</strong>
                    <small>{openedScenePath ?? t('unboundSceneFile')}</small>
                </div>
            </footer>
        </div>
    );
}
