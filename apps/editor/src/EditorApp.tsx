import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DockviewReact, themeLight } from 'dockview-react';
import type { DockviewApi, DockviewReadyEvent, IDockviewPanelProps } from 'dockview-react';
import {
    getCompilerSceneDocument,
} from './document/compilerSceneDocumentController';
import { Button, Select, SystemIcon } from './components/system';
import { useEditorStore } from './editorStore';
import type { EditorLanguage } from './i18n';
import { editorLanguageNames, translate, useI18n } from './i18n';
import { CompilerSceneHierarchyTree } from './panels/HierarchyPanel';
import { InspectorPanel } from './panels/InspectorPanel';
import { ViewportPanel } from './panels/ViewportPanel';
import { useCompilerSceneRevision } from './panels/common';
import { ProjectPreviewPanel, ProjectShelf } from './panels/ProjectShelf';
import {
    openProjectFolder,
    saveCompilerSceneFile,
} from './services/projectFileTree';
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
import { setLastExternalSceneSync } from './services/externalSceneSyncState';

type EditorDockPanelParams = Record<string, never>;
type ExternalSceneSyncStatus = { message: string; tone: 'saved' | 'dirty' };

function dockPanelTitles(language: EditorLanguage) {
    return {
        hierarchy: translate(language, 'hierarchyLabel'),
        preview: translate(language, 'viewportLabel'),
        inspector: 'Inspector',
        projectPreview: translate(language, 'selectedItem'),
        project: translate(language, 'project'),
    };
}

function setDockPanelTitles(api: DockviewApi, language: EditorLanguage) {
    const titles = dockPanelTitles(language);
    api.getPanel('hierarchy')?.api.setTitle(titles.hierarchy);
    api.getPanel('preview')?.api.setTitle(titles.preview);
    api.getPanel('inspector')?.api.setTitle(titles.inspector);
    api.getPanel('projectPreview')?.api.setTitle(titles.projectPreview);
    api.getPanel('project')?.api.setTitle(titles.project);
}

function setInitialDockLayout(api: DockviewApi) {
    api.getPanel('hierarchy')?.group.api.setSize({ width: 340 });
    api.getPanel('project')?.group.api.setSize({ height: 260 });
    api.getPanel('preview')?.group.api.setSize({ width: 640 });
    api.getPanel('inspector')?.group.api.setSize({ width: 420 });
    api.getPanel('projectPreview')?.group.api.setSize({ height: 220 });
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

function HierarchyDockPanel(_props: IDockviewPanelProps<EditorDockPanelParams>) {
    const t = useI18n();
    const openedScenePath = useEditorStore((state) => state.openedScenePath);
    const compilerDocument = getCompilerSceneDocument();
    const isCompilerScene = openedScenePath && compilerDocument?.scenePath === openedScenePath;

    return (
        <section className="workbenchPane workbenchHierarchy" data-testid="workbench-hierarchy" aria-label={t('hierarchyLabel')}>
            {isCompilerScene ? (
                <CompilerSceneHierarchyTree />
            ) : (
                <div className="panelEmptyState">
                    <strong>{t('sceneEmptyTitle')}</strong>
                    <span>{t('sceneEmptyHint')}</span>
                </div>
            )}
        </section>
    );
}

function PreviewDockPanel(_props: IDockviewPanelProps<EditorDockPanelParams>) {
    const t = useI18n();

    return (
        <section className="workbenchPreview" data-testid="workbench-preview" aria-label={t('viewportLabel')}>
            <ViewportPanel />
        </section>
    );
}

function InspectorDockPanel(_props: IDockviewPanelProps<EditorDockPanelParams>) {
    return (
        <section className="workbenchPane workbenchInspector" data-testid="workbench-inspector" aria-label="Inspector">
            <InspectorPanel />
        </section>
    );
}

function ProjectDockPanel(_props: IDockviewPanelProps<EditorDockPanelParams>) {
    return <ProjectShelf />;
}

function ProjectPreviewDockPanel(_props: IDockviewPanelProps<EditorDockPanelParams>) {
    const t = useI18n();

    return (
        <section className="workbenchPane workbenchProjectPreview" data-testid="workbench-project-preview" aria-label={t('selectedItem')}>
            <ProjectPreviewPanel />
        </section>
    );
}

function createDockComponents() {
    return {
        hierarchy: HierarchyDockPanel,
        preview: PreviewDockPanel,
        inspector: InspectorDockPanel,
        projectPreview: ProjectPreviewDockPanel,
        project: ProjectDockPanel,
    };
}

function addInitialPanels(event: DockviewReadyEvent, language: EditorLanguage) {
    const titles = dockPanelTitles(language);
    event.api.addPanel({
        id: 'hierarchy',
        component: 'hierarchy',
        title: titles.hierarchy,
        initialWidth: 340,
        minimumWidth: 240,
        minimumHeight: 180,
    });
    event.api.addPanel({
        id: 'preview',
        component: 'preview',
        title: titles.preview,
        minimumWidth: 420,
        minimumHeight: 300,
        position: { direction: 'right', referencePanel: 'hierarchy' },
    });
    event.api.addPanel({
        id: 'project',
        component: 'project',
        title: titles.project,
        initialHeight: 260,
        minimumWidth: 240,
        minimumHeight: 160,
        position: { direction: 'below', referencePanel: 'hierarchy' },
    });
    event.api.addPanel({
        id: 'inspector',
        component: 'inspector',
        title: titles.inspector,
        initialWidth: 420,
        minimumWidth: 300,
        position: { direction: 'right', referencePanel: 'preview' },
    });
    event.api.addPanel({
        id: 'projectPreview',
        component: 'projectPreview',
        title: titles.projectPreview,
        minimumWidth: 300,
        minimumHeight: 220,
        position: { direction: 'below', referencePanel: 'inspector' },
    });
}

export function EditorApp({ onDockviewReady }: { onDockviewReady?: (api: DockviewApi) => void } = {}) {
    useCompilerSceneRevision();
    const t = useI18n();
    const language = useEditorStore((state) => state.language);
    const setLanguage = useEditorStore((state) => state.setLanguage);
    const setProject = useEditorStore((state) => state.setProject);
    const projectTree = useEditorStore((state) => state.projectTree);
    const openedScenePath = useEditorStore((state) => state.openedScenePath);
    const [saveStatusKey, setSaveStatusKey] = useState<'closed' | 'treeLoaded' | 'noScene' | 'savedFile' | 'compiledFile' | 'compileFailed'>('closed');
    const [savedFileName, setSavedFileName] = useState('');
    const [saveError, setSaveError] = useState('');
    const [externalSceneSyncStatusState, setExternalSceneSyncStatusState] = useState<ExternalSceneSyncStatus | undefined>();
    const [runStatus, setRunStatus] = useState<EditorRunStatus>({
        state: 'unconfigured',
        stdout: [],
        stderr: [],
    });
    const dockviewApiRef = useRef<DockviewApi | undefined>(undefined);
    const dockComponents = useMemo(() => createDockComponents(), []);
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
                if (currentScenePath) {
                    setLastExternalSceneSync(currentScenePath, result);
                }
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

    useEffect(() => {
        if (dockviewApiRef.current) {
            setDockPanelTitles(dockviewApiRef.current, language);
        }
    }, [language]);

    const handleDockReady = useCallback((event: DockviewReadyEvent) => {
        dockviewApiRef.current = event.api;
        onDockviewReady?.(event.api);
        addInitialPanels(event, language);
        window.requestAnimationFrame(() => setInitialDockLayout(event.api));
    }, [language, onDockviewReady]);

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

    const sceneTitle = hasProject ? (
        <>
            <span>{compilerSceneOpened ? `${currentSceneName}.scene` : currentSceneName}</span>
            <span className={currentSceneDirty ? 'statusPill dirty' : 'statusPill saved'}>{currentSceneDirty ? t('dirtyUnsaved') : t('saved')}</span>
        </>
    ) : (
        <>
            <span>{t('projectNotOpened')}</span>
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
                <div className="sceneTitleBar">
                    {sceneTitle}
                </div>
                <div className="topActions" aria-label={t('topActionsLabel')}>
                    <div className="topActionGroup">
                        <Button icon="folder-open" onPress={() => void openFolder()}>{t('openFolder')}</Button>
                        {hasProject ? (
                            <Button icon="save" onPress={() => void saveScene()}>{t('save')}</Button>
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
            <main className={hasProject ? 'dockHost' : 'welcomeHost'} data-testid={hasProject ? 'editor-workbench' : undefined}>
                {hasProject ? (
                    <DockviewReact
                        components={dockComponents}
                        getTabContextMenuItems={() => []}
                        onReady={handleDockReady}
                        theme={themeLight}
                    />
                ) : (
                    <WelcomePage onOpenFolder={() => void openFolder()} />
                )}
            </main>
            <footer className="workbenchStatusBar" aria-label={t('agentStatusTitle')} data-testid="workbench-status-bar">
                <div className="statusBarGroup">
                    <span>{currentSceneDirty ? t('dirtyUnsaved') : t('saved')}</span>
                    <strong data-testid="save-status">{saveStatus}</strong>
                    {externalSceneSyncStatusState ? (
                        <small className={externalSceneSyncStatusState.tone}>Sync: {externalSceneSyncStatusState.message}</small>
                    ) : (
                        <small>{compilerSceneOpened ? `${currentSceneName}.scene` : currentSceneName}</small>
                    )}
                </div>
                <div className="statusBarGroup">
                    <span>{t('runStatusTitle')}</span>
                    <strong>{t(`runState_${runStatus.state}`)}</strong>
                    <small>{runStatus.error ?? runStatus.stderr.at(-1) ?? runStatus.stdout.at(-1) ?? runStatus.command ?? t('runLogEmpty')}</small>
                </div>
                <div className="statusBarSpacer" aria-hidden="true" />
                <div className="statusBarGroup">
                    <span>CLI Context</span>
                    <strong>bun run pixifact -- live</strong>
                    <small>{pixifactAgentBridgeUrl}</small>
                </div>
                <div className="statusBarGroup">
                    <span>{t('agentEditorTarget')}</span>
                    <strong>{currentSceneName}</strong>
                    <small>{openedScenePath ?? t('unboundSceneFile')}</small>
                </div>
            </footer>
        </div>
    );
}
