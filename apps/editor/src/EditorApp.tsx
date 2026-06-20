import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DockviewReact, themeLight } from 'dockview-react';
import type { DockviewApi, DockviewReadyEvent, IDockviewPanelProps, SerializedDockview } from 'dockview-react';
import {
    canRedoCompilerSceneCommand,
    canUndoCompilerSceneCommand,
    getCompilerSceneDocument,
    redoCompilerSceneCommand,
    undoCompilerSceneCommand,
} from './document/compilerSceneDocumentController';
import { Button, Select, SystemIcon } from './components/system';
import {
    editorProjectLayoutStorageKey,
    readEditorProjectLayoutState,
    useEditorStore,
    writeEditorProjectLayoutState,
} from './editorStore';
import type { EditorLanguage } from './i18n';
import { editorLanguageNames, translate, useI18n } from './i18n';
import { CompilerSceneHierarchyTree } from './panels/HierarchyPanel';
import { InspectorPanel } from './panels/InspectorPanel';
import { ViewportPanel } from './panels/ViewportPanel';
import { useCompilerSceneRevision } from './panels/common';
import { ProjectPreviewPanel, ProjectShelf } from './panels/ProjectShelf';
import {
    findFileByPath,
    openCompilerSceneFile,
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
const workbenchDockPanelIds = ['hierarchy', 'preview', 'inspector', 'projectPreview', 'project'];
type ExternalSceneSyncViewState = {
    message: string;
    tone: 'saved' | 'dirty';
    result?: Exclude<CompilerSceneExternalSyncResult, { status: 'ignored' }>;
};

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

function isWorkbenchDockviewLayout(layout: SerializedDockview | undefined): layout is SerializedDockview {
    if (!layout || !layout.panels || typeof layout.panels !== 'object') {
        return false;
    }
    return workbenchDockPanelIds.every((id) => Object.prototype.hasOwnProperty.call(layout.panels, id));
}

function externalSceneSyncStatus(result: CompilerSceneExternalSyncResult): ExternalSceneSyncViewState | undefined {
    if (!('message' in result)) {
        return undefined;
    }
    return {
        message: result.message,
        tone: result.status === 'sceneReloaded' ? 'saved' : 'dirty',
        result,
    };
}

function externalSceneSyncStatusText(state: ExternalSceneSyncViewState, t: ReturnType<typeof useI18n>) {
    if (state.result?.status !== 'validationFailed') {
        return state.message;
    }
    const count = state.result.validation.diagnostics?.length ?? 0;
    return `${state.message} ${t('sceneSyncIssueCount', { count })}`;
}

function sceneSyncLocation(scene: string, line?: number, column?: number) {
    if (!line) {
        return scene;
    }
    return column ? `${scene}:${line}:${column}` : `${scene}:${line}`;
}

function isEditableKeyboardTarget(target: EventTarget | null) {
    return target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || (target instanceof HTMLElement && target.isContentEditable);
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

function SceneSyncDiagnostics({
    projectRoot,
    result,
}: {
    projectRoot: string;
    result?: Extract<CompilerSceneExternalSyncResult, { status: 'validationFailed' }>;
}) {
    const t = useI18n();

    if (!result) {
        return null;
    }

    const diagnostics = result.validation.diagnostics ?? [];
    const validateCommand = `bun run pixifact -- scene validate --project-root ${projectRoot} --scene ${result.validation.scene}`;
    const compileCommand = `bun run pixifact -- compile-scenes --project-root ${projectRoot}`;

    return (
        <section
            aria-label={t('sceneSyncDiagnosticsTitle')}
            className="sceneSyncDiagnostics"
            data-testid="scene-sync-diagnostics"
        >
            <header>
                <div>
                    <strong>{t('sceneSyncValidationFailed')}</strong>
                    <span>{t('sceneSyncPreviewKept')}</span>
                </div>
                <small>{t('sceneSyncIssueCount', { count: diagnostics.length })}</small>
            </header>
            <ol className="sceneSyncDiagnosticList">
                {diagnostics.map((diagnostic, index) => (
                    <li key={`${diagnostic.path}:${diagnostic.prop}:${index}`}>
                        <div className="sceneSyncDiagnosticLocation">
                            <strong>{sceneSyncLocation(result.validation.scene, diagnostic.line, diagnostic.column)}</strong>
                            <span>{diagnostic.path === '__scene__' ? t('sceneSyncSourcePath') : diagnostic.path}</span>
                        </div>
                        <dl>
                            <div>
                                <dt>{t('compilerPath')}</dt>
                                <dd>{diagnostic.path}</dd>
                            </div>
                            <div>
                                <dt>{t('sceneSyncProp')}</dt>
                                <dd>{diagnostic.prop}</dd>
                            </div>
                            <div>
                                <dt>{t('sceneSyncExpected')}</dt>
                                <dd>{diagnostic.expected}</dd>
                            </div>
                            <div>
                                <dt>{t('sceneSyncActual')}</dt>
                                <dd>{diagnostic.actual}</dd>
                            </div>
                        </dl>
                        {diagnostic.hint ? (
                            <p>{diagnostic.hint}</p>
                        ) : null}
                    </li>
                ))}
            </ol>
            <div className="sceneSyncCommands">
                <span>{t('sceneSyncRepairCommands')}</span>
                <code>{validateCommand}</code>
                <code>{compileCommand}</code>
            </div>
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

function addInitialPanels(api: DockviewApi, language: EditorLanguage) {
    const titles = dockPanelTitles(language);
    api.addPanel({
        id: 'hierarchy',
        component: 'hierarchy',
        title: titles.hierarchy,
        initialWidth: 340,
        minimumWidth: 240,
        minimumHeight: 180,
    });
    api.addPanel({
        id: 'preview',
        component: 'preview',
        title: titles.preview,
        minimumWidth: 420,
        minimumHeight: 300,
        position: { direction: 'right', referencePanel: 'hierarchy' },
    });
    api.addPanel({
        id: 'project',
        component: 'project',
        title: titles.project,
        initialHeight: 260,
        minimumWidth: 240,
        minimumHeight: 160,
        position: { direction: 'below', referencePanel: 'hierarchy' },
    });
    api.addPanel({
        id: 'inspector',
        component: 'inspector',
        title: titles.inspector,
        initialWidth: 420,
        minimumWidth: 300,
        position: { direction: 'right', referencePanel: 'preview' },
    });
    api.addPanel({
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
    const [externalSceneSyncStatusState, setExternalSceneSyncStatusState] = useState<ExternalSceneSyncViewState | undefined>();
    const [runStatus, setRunStatus] = useState<EditorRunStatus>({
        state: 'unconfigured',
        stdout: [],
        stderr: [],
    });
    const dockviewApiRef = useRef<DockviewApi | undefined>(undefined);
    const dockviewLayoutSubscriptionRef = useRef<{ dispose(): void } | undefined>(undefined);
    const dockviewRestoringLayoutRef = useRef(false);
    const restoredDockLayoutRef = useRef<{ api: DockviewApi; projectKey: string } | undefined>(undefined);
    const defaultDockviewLayoutRef = useRef<SerializedDockview | undefined>(undefined);
    const dockComponents = useMemo(() => createDockComponents(), []);
    const hasProject = Boolean(projectTree);
    const compilerDocument = getCompilerSceneDocument();
    const compilerSceneOpened = openedScenePath && compilerDocument?.scenePath === openedScenePath;
    const currentSceneDirty = compilerSceneOpened ? compilerDocument.dirty : false;
    const currentSceneName = compilerSceneOpened ? compilerDocument.template.name : t('sceneEmptyTitle');
    const canUndoCompilerScene = Boolean(compilerSceneOpened) && canUndoCompilerSceneCommand();
    const canRedoCompilerScene = Boolean(compilerSceneOpened) && canRedoCompilerSceneCommand();
    const projectRootPath = projectTree?.projectRootPath ?? projectTree?.systemPath ?? '<project-root>';
    const externalSceneValidationFailure = externalSceneSyncStatusState?.result?.status === 'validationFailed'
        ? externalSceneSyncStatusState.result
        : undefined;
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

    useEffect(() => useEditorStore.subscribe((state, previousState) => {
        if (!state.projectTree) {
            return;
        }
        const projectStateChanged = state.projectTree !== previousState.projectTree
            || state.selectedProjectFilePath !== previousState.selectedProjectFilePath
            || state.openedScenePath !== previousState.openedScenePath
            || state.expandedProjectFolders !== previousState.expandedProjectFolders
            || state.expandedHierarchyNodesByScene !== previousState.expandedHierarchyNodesByScene;
        if (!projectStateChanged) {
            return;
        }
        writeEditorProjectLayoutState(state.projectTree, {
            selectedProjectFilePath: state.selectedProjectFilePath,
            openedScenePath: state.openedScenePath,
            expandedProjectFolders: state.expandedProjectFolders,
            expandedHierarchyNodesByScene: state.expandedHierarchyNodesByScene,
        });
    }), []);

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

    useEffect(() => {
        if (!projectTree || !openedScenePath) {
            return;
        }
        const compilerDocument = getCompilerSceneDocument();
        if (compilerDocument?.scenePath === openedScenePath) {
            return;
        }
        const file = findFileByPath(projectTree, openedScenePath);
        if (file?.kind !== 'scene') {
            return;
        }

        let cancelled = false;
        void openCompilerSceneFile(projectTree, file)
            .catch((error) => {
                if (!cancelled) {
                    setExternalSceneSyncStatusState({
                        message: error instanceof Error ? error.message : String(error),
                        tone: 'dirty',
                    });
                }
            });

        return () => {
            cancelled = true;
        };
    }, [openedScenePath, projectTree]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (isEditableKeyboardTarget(event.target)) {
                return;
            }
            const key = event.key.toLowerCase();
            const usesModifier = event.metaKey || event.ctrlKey;
            const wantsUndo = usesModifier && key === 'z' && !event.shiftKey;
            const wantsRedo = usesModifier && ((key === 'z' && event.shiftKey) || key === 'y');
            if (wantsUndo && canUndoCompilerSceneCommand()) {
                event.preventDefault();
                undoCompilerSceneCommand();
                return;
            }
            if (wantsRedo && canRedoCompilerSceneCommand()) {
                event.preventDefault();
                redoCompilerSceneCommand();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const saveCurrentDockviewLayout = useCallback((api: DockviewApi) => {
        if (dockviewRestoringLayoutRef.current) {
            return;
        }
        const currentProjectTree = useEditorStore.getState().projectTree;
        if (!currentProjectTree) {
            return;
        }
        writeEditorProjectLayoutState(currentProjectTree, {
            dockview: api.toJSON(),
        });
    }, []);

    const createDefaultDockviewLayout = useCallback((api: DockviewApi) => {
        api.clear();
        addInitialPanels(api, language);
        setInitialDockLayout(api);
        setDockPanelTitles(api, language);
        const layout = api.toJSON();
        defaultDockviewLayoutRef.current = layout;
        return layout;
    }, [language]);

    const restoreDockviewLayout = useCallback((api: DockviewApi, nextProjectTree: NonNullable<typeof projectTree>) => {
        const projectLayoutKey = editorProjectLayoutStorageKey(nextProjectTree);
        const restoredDockLayout = restoredDockLayoutRef.current;
        if (restoredDockLayout?.api === api && restoredDockLayout.projectKey === projectLayoutKey) {
            return;
        }

        restoredDockLayoutRef.current = {
            api,
            projectKey: projectLayoutKey,
        };
        dockviewRestoringLayoutRef.current = true;

        let restored = false;
        const defaultLayout = defaultDockviewLayoutRef.current ?? createDefaultDockviewLayout(api);
        const saved = readEditorProjectLayoutState(nextProjectTree);
        if (isWorkbenchDockviewLayout(saved?.dockview)) {
            try {
                api.fromJSON(saved.dockview);
                restored = true;
            } catch {
                api.clear();
            }
        }
        if (!restored) {
            api.fromJSON(defaultLayout);
        }
        setDockPanelTitles(api, language);

        queueMicrotask(() => {
            dockviewRestoringLayoutRef.current = false;
            saveCurrentDockviewLayout(api);
        });
    }, [createDefaultDockviewLayout, language, saveCurrentDockviewLayout]);

    const resetDockviewLayout = useCallback(() => {
        const api = dockviewApiRef.current;
        if (!api || !projectTree) {
            return;
        }

        const projectLayoutKey = editorProjectLayoutStorageKey(projectTree);
        restoredDockLayoutRef.current = {
            api,
            projectKey: projectLayoutKey,
        };
        dockviewRestoringLayoutRef.current = true;
        const defaultLayout = defaultDockviewLayoutRef.current ?? createDefaultDockviewLayout(api);
        api.fromJSON(defaultLayout);
        setDockPanelTitles(api, language);
        window.requestAnimationFrame(() => setInitialDockLayout(api));

        queueMicrotask(() => {
            dockviewRestoringLayoutRef.current = false;
            saveCurrentDockviewLayout(api);
        });
    }, [createDefaultDockviewLayout, language, projectTree, saveCurrentDockviewLayout]);

    useEffect(() => {
        const api = dockviewApiRef.current;
        if (!api || !projectTree) {
            return;
        }
        restoreDockviewLayout(api, projectTree);
    }, [projectTree, restoreDockviewLayout]);

    useEffect(() => () => {
        dockviewLayoutSubscriptionRef.current?.dispose();
    }, []);

    const handleDockReady = useCallback((event: DockviewReadyEvent) => {
        dockviewApiRef.current = event.api;
        onDockviewReady?.(event.api);
        dockviewLayoutSubscriptionRef.current?.dispose();
        dockviewLayoutSubscriptionRef.current = event.api.onDidLayoutChange(() => {
            saveCurrentDockviewLayout(event.api);
        });
        const currentProjectTree = useEditorStore.getState().projectTree;
        if (currentProjectTree) {
            restoreDockviewLayout(event.api, currentProjectTree);
        }
    }, [onDockviewReady, restoreDockviewLayout, saveCurrentDockviewLayout]);

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
    const undoScene = useCallback(() => {
        undoCompilerSceneCommand();
    }, []);
    const redoScene = useCallback(() => {
        redoCompilerSceneCommand();
    }, []);
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
                            <>
                                <Button icon="save" onPress={() => void saveScene()}>{t('save')}</Button>
                                <Button icon="reset" onPress={resetDockviewLayout}>{t('resetLayout')}</Button>
                                <Button
                                    aria-label="撤销"
                                    disabled={!canUndoCompilerScene}
                                    icon="undo"
                                    onPress={undoScene}
                                    title="撤销"
                                />
                                <Button
                                    aria-label="重做"
                                    disabled={!canRedoCompilerScene}
                                    icon="redo"
                                    onPress={redoScene}
                                    title="重做"
                                />
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
            {externalSceneValidationFailure ? (
                <SceneSyncDiagnostics
                    projectRoot={projectRootPath}
                    result={externalSceneValidationFailure}
                />
            ) : null}
            <footer className="workbenchStatusBar" aria-label={t('agentStatusTitle')} data-testid="workbench-status-bar">
                <div className="statusBarGroup">
                    <span>{currentSceneDirty ? t('dirtyUnsaved') : t('saved')}</span>
                    <strong data-testid="save-status">{saveStatus}</strong>
                    {externalSceneSyncStatusState ? (
                        <small className={externalSceneSyncStatusState.tone}>Sync: {externalSceneSyncStatusText(externalSceneSyncStatusState, t)}</small>
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
