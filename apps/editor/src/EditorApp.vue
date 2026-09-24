<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { ArrowLeft, ArrowRight, Redo2, RefreshCw, Save, Settings2, Undo2, X } from 'lucide-vue-next';
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger, TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui';
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, triggerRef, watch } from 'vue';
import {
    pairedSceneScriptPath,
    resolveSceneReference,
    type SceneTemplateInterface,
} from 'pixifact/compiler';
import AssetsPanel from './panels/AssetsPanel.vue';
import HierarchyPanel from './panels/HierarchyPanel.vue';
import InspectorPanel from './panels/InspectorPanel.vue';
import SceneCanvas from './preview/SceneCanvas.vue';
import type { SceneCanvasView } from './preview/sceneCanvasGeometry';
import { SceneDocument } from './document/SceneDocument';
import {
    duplicateSceneNode,
    findSceneTreeEntry,
    remapSceneSelection,
    type EditorSceneAsset,
} from './document/sceneTree';
import {
    connectEditorSession,
    createEditorProjectTree,
    editorSceneFileApi,
    readEditorSceneBindings,
    readEditorProject,
    readEditorScene,
    readEditorUiState,
    writeEditorUiState,
    type EditorScreenshotRequest,
    type EditorSessionConnection,
    type EditorSessionResumeState,
    type EditorSessionState,
    type EditorProject,
} from './services/editorApi';
import { editorSelectionContext } from './services/editorContext';
import type { ProjectFileTreeNode } from './services/projectFileTree';
import { useEditorUiStore } from './stores/editorUi';

const ui = useEditorUiStore();
const { activeLeftTab, currentScenePath, selectedLocator, syncState } = storeToRefs(ui);
const project = ref<EditorProject>();
const projectTree = ref<ProjectFileTreeNode>();
const sceneInterfaces = ref<Record<string, SceneTemplateInterface>>({});
const assetTreeExpandedDirectories = ref<string[]>();
const autoSave = ref(false);
const document = ref<SceneDocument>();
const sceneTabs = shallowRef<SceneTab[]>([]);
const documentRevision = ref(0);
const error = ref('');
const closingPath = ref<string>();
const conflict = ref<{ path: string; localSource: string; diskSource: string; diskVersion: string }>();
const closeModal = ref<HTMLElement>();
const conflictModal = ref<HTMLElement>();
const draggedAsset = ref<EditorSceneAsset>();
const assetFocusRequest = ref<{ generation: number; path: string }>();
const refreshing = ref(false);
const previewState = ref<'loading' | 'ready' | 'error'>('loading');
const sessionState = ref<'connecting' | 'active' | 'standby'>('connecting');
const sessionStateMessage = ref('');
const standbyReason = ref<'takenOver'>();
const standbyScenePath = ref<string>();
const takeoverPending = ref(false);
const hierarchyPanel = ref<{
    cancelCurrentDrag?: () => boolean;
}>();
const sceneCanvas = ref<{
    cancelCurrentInteraction?: () => boolean;
    captureScreenshot?: () => Promise<{
        path: string;
        revision: string;
        width: number;
        height: number;
        dataUrl: string;
    }>;
    captureView?: () => SceneCanvasView | undefined;
    restoreView?: (view: SceneCanvasView) => void;
}>();
const navigationEntries = ref<SceneNavigationEntry[]>([]);
const navigationIndex = ref(-1);
const navigationPending = ref(false);
let sessionConnection: EditorSessionConnection | undefined;
let sessionStateRevision = 0;
let projectChangeTimer: ReturnType<typeof setTimeout> | undefined;
let projectChangeGeneration = 0;
let projectRefreshRunning = false;
let editorDisposed = false;
let sceneOpenGeneration = 0;
let editorUiStateSaveGeneration = 0;
let editorUiStateSaving = false;
let assetFocusGeneration = 0;
const pendingProjectChanges = new Set<string>();

interface SceneNavigationEntry {
    path: string;
}

interface SceneTab {
    path: string;
    document: SceneDocument;
    selectedLocator?: string;
    view?: SceneCanvasView;
    syncState: SceneDocument['syncState'];
    pendingExternalReload: boolean;
    unsubscribe: () => void;
}

const sceneName = computed(() => currentScenePath.value?.split('/').at(-1)?.replace(/\.scene$/, '') ?? '未打开 Scene');
const syncLabel = computed(() => ({
    synced: '已同步',
    unsaved: '未保存',
    saving: '正在写入',
    conflict: '同步冲突',
    error: '写入失败',
}[syncState.value]));
const canNavigateBack = computed(() => navigationIndex.value > 0 && !navigationPending.value);
const canNavigateForward = computed(() => (
    navigationIndex.value >= 0
    && navigationIndex.value < navigationEntries.value.length - 1
    && !navigationPending.value
));

function tabFor(path: string) {
    return sceneTabs.value.find((tab) => tab.path === path);
}

function subscribeTab(tab: SceneTab) {
    tab.unsubscribe = tab.document.subscribe((event) => {
        if (event.type === 'syncStateChanged') {
            tab.syncState = event.state;
            triggerRef(sceneTabs);
            if (currentScenePath.value === tab.path) syncState.value = event.state;
            publishEditorContext();
            if (event.state === 'conflict') void loadConflict(tab);
            if (event.state === 'synced' && tab.pendingExternalReload) void reloadPendingTab(tab);
        }
        if (event.type === 'commandApplied') {
            tab.selectedLocator = event.selection?.type === 'node'
                ? event.selection.node
                : undefined;
            if (currentScenePath.value === tab.path) {
                documentRevision.value += 1;
                selectedLocator.value = tab.selectedLocator;
            }
        }
    });
}

function replaceTabDocument(tab: SceneTab, next: SceneDocument, selection?: string) {
    tab.unsubscribe();
    tab.document = markRaw(next);
    tab.selectedLocator = selection;
    tab.syncState = next.syncState;
    tab.pendingExternalReload = false;
    subscribeTab(tab);
    triggerRef(sceneTabs);
    if (currentScenePath.value === tab.path) {
        previewState.value = 'loading';
        document.value = tab.document;
        selectedLocator.value = selection;
        syncState.value = next.syncState;
        documentRevision.value += 1;
    }
}

async function activateTab(tab: SceneTab) {
    if (currentScenePath.value === tab.path) return;
    const previous = currentScenePath.value && tabFor(currentScenePath.value);
    if (previous) {
        previous.selectedLocator = selectedLocator.value;
        previous.view = sceneCanvas.value?.captureView?.() ?? previous.view;
    }
    previewState.value = 'loading';
    document.value = tab.document;
    currentScenePath.value = tab.path;
    selectedLocator.value = tab.selectedLocator;
    syncState.value = tab.syncState;
    documentRevision.value += 1;
    scheduleEditorUiStateSave();
    await nextTick();
    if (currentScenePath.value === tab.path && tab.view) sceneCanvas.value?.restoreView?.(tab.view);
}

async function openScene(path: string, selection?: string) {
    const revision = sessionStateRevision;
    const generation = ++sceneOpenGeneration;
    error.value = '';
    try {
        let tab = tabFor(path);
        const next = tab ? undefined : await SceneDocument.open(path, editorSceneFileApi, { autoSave: autoSave.value });
        if (
            sessionState.value !== 'active'
            || revision !== sessionStateRevision
            || generation !== sceneOpenGeneration
        ) return false;
        if (!tab) {
            tab = {
                path,
                document: markRaw(next!),
                selectedLocator: selection,
                syncState: next!.syncState,
                pendingExternalReload: false,
                unsubscribe: () => {},
            };
            subscribeTab(tab);
            sceneTabs.value = [...sceneTabs.value, tab];
        }
        await activateTab(tab);
        if (generation !== sceneOpenGeneration) return false;
        return true;
    } catch (cause) {
        if (
            sessionState.value === 'active'
            && revision === sessionStateRevision
            && generation === sceneOpenGeneration
        ) {
            error.value = cause instanceof Error ? cause.message : String(cause);
        }
        return false;
    }
}

function resetSceneNavigation(path: string) {
    navigationEntries.value = [{ path }];
    navigationIndex.value = 0;
}

async function navigateToScene(path: string) {
    if (navigationPending.value || path === document.value?.path) return;
    navigationPending.value = true;
    try {
        if (!await openScene(path)) return;
        navigationEntries.value = [
            ...navigationEntries.value.slice(0, navigationIndex.value + 1),
            { path },
        ];
        navigationIndex.value += 1;
    } finally {
        navigationPending.value = false;
    }
}

async function navigateHistory(offset: -1 | 1) {
    if (navigationPending.value) return;
    const targetIndex = navigationIndex.value + offset;
    const target = navigationEntries.value[targetIndex];
    if (!target) return;
    navigationPending.value = true;
    try {
        if (!await openScene(target.path)) return;
        navigationIndex.value = targetIndex;
    } finally {
        navigationPending.value = false;
    }
}

function navigateToSceneReference(reference: string) {
    const current = document.value;
    if (!current) return;
    void navigateToScene(resolveSceneReference(current.path, reference));
}

async function readSceneInterfaces() {
    const descriptors = await readEditorSceneBindings();
    return Object.fromEntries(
        Object.entries(descriptors).map(([scenePath, descriptor]) => [scenePath, descriptor.interface]),
    );
}

function projectChangeIsCurrent(generation: number) {
    return !editorDisposed && sessionState.value === 'active' && generation === projectChangeGeneration;
}

async function applyProjectChanges(paths: readonly string[], generation: number) {
    if (!projectChangeIsCurrent(generation)) return;
    const current = document.value;
    const currentProject = project.value;
    const knownFiles = new Map(currentProject?.files.map((file) => [file.path, file]));
    const unknownPaths = new Set(paths.filter((path) => !knownFiles.has(path)));
    let indexedProject = currentProject;
    if (unknownPaths.size > 0) {
        indexedProject = await readEditorProject();
        if (!projectChangeIsCurrent(generation)) return;
    }
    const indexedFiles = new Map(indexedProject?.files.map((file) => [file.path, file]));
    const changedFiles = paths.flatMap((path) => {
        const file = knownFiles.get(path) ?? indexedFiles.get(path);
        return file ? [file] : [];
    });
    const pairedScripts = new Set(indexedProject?.scenes.map(pairedSceneScriptPath));
    const pairedScriptChanged = changedFiles.some((file) => file.kind === 'script' && pairedScripts.has(file.path));
    const projectIndexChanged = changedFiles.some((file) => (
        file.kind === 'image'
        || (file.kind === 'scene' && file.path !== current?.path)
        || (file.kind === 'script' && pairedScripts.has(file.path) && unknownPaths.has(file.path))
    ));
    const changedTabs = sceneTabs.value.filter((tab) => paths.includes(tab.path));
    for (const tab of changedTabs) {
        if (tab.document.dirty) tab.pendingExternalReload = true;
    }
    const [nextProject, nextSceneInterfaces, reloadedTabs] = await Promise.all([
        projectIndexChanged
            ? indexedProject === currentProject ? readEditorProject() : indexedProject
            : undefined,
        pairedScriptChanged ? readSceneInterfaces() : undefined,
        Promise.all(changedTabs.map(async (tab) => ({
            tab,
            previous: tab.document,
            latest: await tab.document.reloadIfChanged(),
        }))),
    ]);
    if (!projectChangeIsCurrent(generation)) return;
    if (nextProject) {
        project.value = nextProject;
        projectTree.value = createEditorProjectTree(nextProject);
    }
    if (nextSceneInterfaces) {
        sceneInterfaces.value = nextSceneInterfaces;
    }
    for (const { tab, previous, latest } of reloadedTabs) {
        if (!latest || tab.document !== previous || !sceneTabs.value.includes(tab)) continue;
        const selection = remapSceneSelection(previous.template, latest.template, tab.selectedLocator);
        replaceTabDocument(tab, latest, selection);
    }
    error.value = '';
}

async function reloadPendingTab(tab: SceneTab) {
    const previous = tab.document;
    try {
        const latest = await previous.reloadIfChanged();
        if (tabFor(tab.path) !== tab || tab.document !== previous || previous.syncState !== 'synced') return;
        tab.pendingExternalReload = false;
        if (latest) {
            const selection = remapSceneSelection(previous.template, latest.template, tab.selectedLocator);
            replaceTabDocument(tab, latest, selection);
        }
    } catch (cause) {
        error.value = cause instanceof Error ? cause.message : String(cause);
    }
}

async function flushProjectChanges() {
    if (projectRefreshRunning) return;
    projectRefreshRunning = true;
    try {
        while (pendingProjectChanges.size > 0) {
            const paths = [...pendingProjectChanges];
            pendingProjectChanges.clear();
            const generation = projectChangeGeneration;
            try {
                await applyProjectChanges(paths, generation);
            } catch (cause) {
                if (projectChangeIsCurrent(generation)) {
                    error.value = cause instanceof Error ? cause.message : String(cause);
                }
            }
            if (generation !== projectChangeGeneration && projectChangeIsCurrent(projectChangeGeneration)) {
                for (const path of paths) pendingProjectChanges.add(path);
            }
        }
    } finally {
        projectRefreshRunning = false;
    }
}

function scheduleProjectChange(path: string) {
    pendingProjectChanges.add(path);
    projectChangeGeneration += 1;
    if (projectChangeTimer) clearTimeout(projectChangeTimer);
    projectChangeTimer = window.setTimeout(() => {
        projectChangeTimer = undefined;
        void flushProjectChanges();
    }, 30);
}

function publishEditorContext() {
    const current = document.value;
    if (!current || !sessionConnection) return;
    sessionConnection.publishContext({
        scene: {
            path: current.path,
            revision: current.version,
            syncState: syncState.value,
            previewState: previewState.value,
        },
        selection: editorSelectionContext(current.template, selectedLocator.value),
        openScenes: sceneTabs.value.map((tab) => ({ path: tab.path, syncState: tab.syncState })),
    });
}

watch([document, documentRevision, selectedLocator, syncState, previewState, sceneTabs], publishEditorContext, { flush: 'post' });
watch(selectedLocator, (selection) => {
    const tab = currentScenePath.value && tabFor(currentScenePath.value);
    if (tab) tab.selectedLocator = selection;
});
watch([closingPath, conflict], async () => {
    await nextTick();
    (conflictModal.value ?? closeModal.value)?.querySelector('button')?.focus();
});

function handleModalKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Tab') return;
    const modal = conflictModal.value ?? closeModal.value;
    if (!modal) return;
    const buttons = Array.from(modal.querySelectorAll('button'));
    const first = buttons[0];
    const last = buttons.at(-1);
    if (event.shiftKey && window.document.activeElement === first) {
        event.preventDefault();
        last?.focus();
    } else if (!event.shiftKey && window.document.activeElement === last) {
        event.preventDefault();
        first?.focus();
    }
}

async function captureEditorScreenshot(request: EditorScreenshotRequest) {
    const current = document.value;
    if (
        sessionState.value !== 'active'
        || !current
        || current.path !== request.path
        || current.version !== request.revision
        || syncState.value !== 'synced'
        || previewState.value !== 'ready'
    ) {
        throw new Error('Authoring preview is not ready for the requested Scene revision.');
    }
    const capture = sceneCanvas.value?.captureScreenshot;
    if (!capture) {
        throw new Error('Authoring preview screenshot capture is unavailable.');
    }
    const result = await capture();
    if (
        sessionState.value !== 'active'
        || document.value !== current
        || current.path !== request.path
        || current.version !== request.revision
        || syncState.value !== 'synced'
        || previewState.value !== 'ready'
        || result.path !== request.path
        || result.revision !== request.revision
    ) {
        throw new Error('Authoring preview changed during screenshot capture.');
    }
    return {
        width: result.width,
        height: result.height,
        dataUrl: result.dataUrl,
    };
}

async function refreshEditor() {
    const current = document.value;
    if (!current || refreshing.value || syncState.value !== 'synced') return;
    error.value = '';
    refreshing.value = true;
    try {
        const [nextProject, nextSceneInterfaces, latest] = await Promise.all([
            readEditorProject(),
            readSceneInterfaces(),
            current.reloadIfChanged(),
        ]);
        if (document.value !== current || current.syncState !== 'synced') return;
        const selection = latest
            ? remapSceneSelection(current.template, latest.template, selectedLocator.value)
            : selectedLocator.value;
        project.value = nextProject;
        projectTree.value = createEditorProjectTree(nextProject);
        sceneInterfaces.value = nextSceneInterfaces;
        if (latest) {
            const tab = tabFor(current.path);
            if (tab && tab.document === current) replaceTabDocument(tab, latest, selection);
        }
    } catch (cause) {
        error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
        refreshing.value = false;
    }
}

async function undo() {
    error.value = '';
    try {
        await document.value?.undo();
    } catch (cause) {
        error.value = cause instanceof Error ? cause.message : String(cause);
    }
}

async function redo() {
    error.value = '';
    try {
        await document.value?.redo();
    } catch (cause) {
        error.value = cause instanceof Error ? cause.message : String(cause);
    }
}

async function saveCurrentScene() {
    const tab = currentScenePath.value && tabFor(currentScenePath.value);
    if (tab) await saveTab(tab);
}

async function saveTab(tab: SceneTab) {
    error.value = '';
    try {
        await tab.document.save();
        return true;
    } catch (cause) {
        if (tab.document.syncState !== 'conflict') {
            error.value = cause instanceof Error ? cause.message : String(cause);
        }
        return false;
    }
}

async function loadConflict(tab: SceneTab) {
    const conflictedDocument = tab.document;
    try {
        const disk = await readEditorScene(tab.path);
        if (tabFor(tab.path) !== tab || tab.document !== conflictedDocument || tab.syncState !== 'conflict') return;
        conflict.value = {
            path: tab.path,
            localSource: tab.document.source,
            diskSource: disk.source,
            diskVersion: disk.version,
        };
        closingPath.value = undefined;
    } catch (cause) {
        error.value = cause instanceof Error ? cause.message : String(cause);
    }
}

async function overwriteConflictedScene() {
    const pending = conflict.value;
    const tab = pending && tabFor(pending.path);
    if (!pending || !tab) return;
    error.value = '';
    try {
        await tab.document.saveOverVersion(pending.diskVersion);
        conflict.value = undefined;
    } catch (cause) {
        if (tab.document.syncState === 'conflict') {
            await loadConflict(tab);
        } else {
            error.value = cause instanceof Error ? cause.message : String(cause);
        }
    }
}

async function discardConflictedDraft() {
    const pending = conflict.value;
    const tab = pending && tabFor(pending.path);
    if (!pending || !tab) return;
    error.value = '';
    try {
        const latest = await SceneDocument.open(tab.path, editorSceneFileApi, { autoSave: autoSave.value });
        if (tabFor(tab.path) !== tab) return;
        replaceTabDocument(tab, latest, remapSceneSelection(tab.document.template, latest.template, tab.selectedLocator));
        conflict.value = undefined;
    } catch (cause) {
        error.value = cause instanceof Error ? cause.message : String(cause);
    }
}

function finishCloseTab(tab: SceneTab) {
    const index = sceneTabs.value.indexOf(tab);
    if (index < 0) return;
    tab.unsubscribe();
    sceneTabs.value = sceneTabs.value.filter((item) => item !== tab);
    const currentHistory = navigationEntries.value[navigationIndex.value];
    navigationEntries.value = navigationEntries.value.filter((entry) => entry.path !== tab.path);
    navigationIndex.value = currentHistory
        ? navigationEntries.value.findIndex((entry) => entry === currentHistory)
        : -1;
    if (navigationIndex.value < 0) navigationIndex.value = navigationEntries.value.length - 1;
    if (currentScenePath.value === tab.path) {
        const next = sceneTabs.value[Math.min(index, sceneTabs.value.length - 1)];
        if (next) {
            void activateTab(next);
        } else {
            document.value = undefined;
            currentScenePath.value = undefined;
            selectedLocator.value = undefined;
            syncState.value = 'synced';
            previewState.value = 'loading';
            sessionConnection?.clearContext();
            scheduleEditorUiStateSave();
        }
    } else {
        scheduleEditorUiStateSave();
    }
    closingPath.value = undefined;
    if (conflict.value?.path === tab.path) conflict.value = undefined;
}

function closeTab(path: string) {
    const tab = tabFor(path);
    if (!tab) return;
    if (tab.syncState === 'saving') return;
    if (tab.document.dirty) {
        closingPath.value = path;
        return;
    }
    finishCloseTab(tab);
}

function discardAndCloseTab() {
    const tab = closingPath.value && tabFor(closingPath.value);
    if (tab) finishCloseTab(tab);
}

async function saveAndCloseTab() {
    const tab = closingPath.value && tabFor(closingPath.value);
    if (tab && await saveTab(tab)) finishCloseTab(tab);
}

async function saveAfterInputBlur() {
    await nextTick();
    await saveCurrentScene();
}

function eventTargetsEditableControl(event: KeyboardEvent) {
    const target = event.target;
    return target instanceof Element && !!target.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
    );
}

async function commitShortcutCommand(command: Parameters<SceneDocument['commitCommand']>[0]) {
    const current = document.value;
    if (!current) return;
    error.value = '';
    try {
        await current.commitCommand(command);
    } catch (cause) {
        error.value = cause instanceof Error ? cause.message : String(cause);
    }
}

function duplicateSelection() {
    const current = document.value;
    const selection = selectedLocator.value;
    if (!current || !selection) return;
    const entry = findSceneTreeEntry(current.template.children, selection);
    if (!entry || entry.node.kind === 'slotOutlet') return;
    void commitShortcutCommand({
        op: 'insertNode',
        parent: entry.parentLocator,
        index: entry.index + 1,
        node: duplicateSceneNode(current.template, entry.node),
    });
}

function deleteSelection() {
    if (!selectedLocator.value) return;
    void commitShortcutCommand({ op: 'deleteNode', node: selectedLocator.value });
}

function cancelEditorInteraction() {
    const canceledAssetDrag = !!draggedAsset.value;
    const canceledHierarchyDrag = hierarchyPanel.value?.cancelCurrentDrag?.() ?? false;
    const canceledCanvasInteraction = sceneCanvas.value?.cancelCurrentInteraction?.() ?? false;
    endAssetDrag();
    if (!canceledAssetDrag && !canceledHierarchyDrag && !canceledCanvasInteraction) {
        selectedLocator.value = undefined;
    }
}

function handleEditorKeyDown(event: KeyboardEvent) {
    if (closingPath.value || conflict.value) {
        if (event.code === 'Escape') {
            event.preventDefault();
            closingPath.value = undefined;
            conflict.value = undefined;
        }
        return;
    }
    if (
        sessionState.value !== 'active'
        || !document.value
        || event.repeat
        || event.altKey
    ) return;
    const commandKey = event.metaKey || event.ctrlKey;
    if (commandKey && !event.shiftKey && event.code === 'KeyS') {
        event.preventDefault();
        if (eventTargetsEditableControl(event) && event.target instanceof HTMLElement) event.target.blur();
        void saveAfterInputBlur();
        return;
    }
    if (eventTargetsEditableControl(event)) return;
    if (commandKey && event.code === 'KeyZ') {
        event.preventDefault();
        if (event.shiftKey) void redo();
        else void undo();
        return;
    }
    if (commandKey && !event.shiftKey && event.code === 'KeyD') {
        event.preventDefault();
        duplicateSelection();
        return;
    }
    if (!commandKey && !event.shiftKey && (event.code === 'Delete' || event.code === 'Backspace')) {
        event.preventDefault();
        deleteSelection();
        return;
    }
    if (!commandKey && !event.shiftKey && event.code === 'Escape') {
        event.preventDefault();
        cancelEditorInteraction();
    }
}

function handleBeforeUnload(event: BeforeUnloadEvent) {
    if (!sceneTabs.value.some((tab) => tab.document.dirty || tab.syncState === 'saving')) return;
    event.preventDefault();
    event.returnValue = '';
}

function startAssetDrag(asset: EditorSceneAsset) {
    draggedAsset.value = asset;
    activeLeftTab.value = 'hierarchy';
}

function locateAsset(path: string) {
    activeLeftTab.value = 'assets';
    assetFocusRequest.value = { generation: ++assetFocusGeneration, path };
}

function saveAssetTreeExpansion(directories: string[]) {
    assetTreeExpandedDirectories.value = directories;
    scheduleEditorUiStateSave();
}

function changeAutoSave(enabled: boolean) {
    autoSave.value = enabled;
    scheduleEditorUiStateSave();
    for (const tab of sceneTabs.value) {
        void tab.document.setAutoSave(enabled).catch((cause) => {
            error.value = `${tab.path}: ${cause instanceof Error ? cause.message : String(cause)}`;
        });
    }
}

function scheduleEditorUiStateSave() {
    editorUiStateSaveGeneration += 1;
    if (!editorUiStateSaving) void flushEditorUiState();
}

async function flushEditorUiState() {
    editorUiStateSaving = true;
    try {
        while (true) {
            if (editorDisposed || sessionState.value !== 'active') return;
            const saveGeneration = editorUiStateSaveGeneration;
            await writeEditorUiState({
                assetTreeExpandedDirectories: assetTreeExpandedDirectories.value ?? [],
                autoSave: autoSave.value,
                openScenePaths: sceneTabs.value.map((tab) => tab.path),
                activeScenePath: currentScenePath.value,
            });
            if (saveGeneration === editorUiStateSaveGeneration) return;
        }
    } catch (cause) {
        error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
        editorUiStateSaving = false;
    }
}

function endAssetDrag() {
    draggedAsset.value = undefined;
}

function clearWorkspace() {
    projectChangeGeneration += 1;
    sceneOpenGeneration += 1;
    for (const tab of sceneTabs.value) tab.unsubscribe();
    sceneTabs.value = [];
    document.value = undefined;
    closingPath.value = undefined;
    conflict.value = undefined;
    assetTreeExpandedDirectories.value = undefined;
    autoSave.value = false;
    projectTree.value = undefined;
    sceneInterfaces.value = {};
    currentScenePath.value = undefined;
    selectedLocator.value = undefined;
    syncState.value = 'synced';
    documentRevision.value += 1;
    draggedAsset.value = undefined;
    assetFocusRequest.value = undefined;
    refreshing.value = false;
    previewState.value = 'loading';
    navigationEntries.value = [];
    navigationIndex.value = -1;
    navigationPending.value = false;
    pendingProjectChanges.clear();
    if (projectChangeTimer) {
        clearTimeout(projectChangeTimer);
        projectChangeTimer = undefined;
    }
}

async function loadActiveWorkspace(resume?: EditorSessionResumeState) {
    const revision = sessionStateRevision;
    error.value = '';
    const [nextProject, nextSceneInterfaces, nextUiState] = await Promise.all([
        readEditorProject(),
        readSceneInterfaces(),
        readEditorUiState(),
    ]);
    if (sessionState.value !== 'active' || revision !== sessionStateRevision) return;
    project.value = nextProject;
    projectTree.value = createEditorProjectTree(nextProject);
    sceneInterfaces.value = nextSceneInterfaces;
    assetTreeExpandedDirectories.value = nextUiState.assetTreeExpandedDirectories;
    autoSave.value = nextUiState.autoSave ?? false;
    const savedPaths = (nextUiState.openScenePaths ?? []).filter((path) => nextProject.scenes.includes(path));
    const activePath = resume?.scenePath ?? nextUiState.activeScenePath ?? savedPaths[0]
        ?? (nextUiState.openScenePaths ? undefined : nextProject.scenes[0]);
    const paths = [...new Set([...savedPaths, ...(activePath ? [activePath] : [])])];
    for (const path of paths) {
        await openScene(path, path === resume?.scenePath ? resume?.selectedLocator : undefined);
    }
    if (activePath && await openScene(activePath)) {
        resetSceneNavigation(activePath);
    } else if (paths.length === 0) {
        sessionConnection?.clearContext();
    }
}

async function applyEditorSessionState(next: EditorSessionState) {
    sessionStateRevision += 1;
    takeoverPending.value = false;
    sessionStateMessage.value = next.error ?? '';
    standbyScenePath.value = next.resume?.scenePath;
    if (next.status === 'standby') {
        if (next.reason || sessionState.value !== 'standby') {
            standbyReason.value = next.reason;
        }
        sessionState.value = 'standby';
        clearWorkspace();
        if (!project.value) {
            const revision = sessionStateRevision;
            try {
                const nextProject = await readEditorProject();
                if (sessionState.value === 'standby' && revision === sessionStateRevision) {
                    project.value = nextProject;
                }
            } catch (cause) {
                sessionStateMessage.value = cause instanceof Error ? cause.message : String(cause);
            }
        }
        return;
    }
    standbyReason.value = undefined;
    sessionState.value = 'active';
    try {
        await loadActiveWorkspace(next.resume);
    } catch (cause) {
        error.value = cause instanceof Error ? cause.message : String(cause);
    }
}

function requestTakeover() {
    if (!sessionConnection || takeoverPending.value) return;
    takeoverPending.value = true;
    sessionStateMessage.value = '';
    sessionConnection.requestTakeover();
}

onMounted(async () => {
    window.addEventListener('pointerup', endAssetDrag);
    window.addEventListener('pointercancel', endAssetDrag);
    window.addEventListener('keydown', handleEditorKeyDown);
    window.addEventListener('beforeunload', handleBeforeUnload);
    try {
        const connection = await connectEditorSession(
            scheduleProjectChange,
            () => {
                sessionConnection = undefined;
                takeoverPending.value = false;
                const message = 'Editor 与本地项目服务的连接已断开。';
                if (sessionState.value === 'standby') {
                    sessionStateMessage.value = message;
                } else {
                    error.value = message;
                }
            },
            (next) => void applyEditorSessionState(next),
            captureEditorScreenshot,
        );
        sessionConnection = connection;
        await applyEditorSessionState(connection.initialState);
    } catch (cause) {
        error.value = cause instanceof Error ? cause.message : String(cause);
    }
});

onBeforeUnmount(() => {
    editorDisposed = true;
    sceneOpenGeneration += 1;
    window.removeEventListener('pointerup', endAssetDrag);
    window.removeEventListener('pointercancel', endAssetDrag);
    window.removeEventListener('keydown', handleEditorKeyDown);
    window.removeEventListener('beforeunload', handleBeforeUnload);
    if (projectChangeTimer) clearTimeout(projectChangeTimer);
    projectChangeGeneration += 1;
    pendingProjectChanges.clear();
    for (const tab of sceneTabs.value) tab.unsubscribe();
    sessionConnection?.close();
});
</script>

<template>
  <main v-if="sessionState === 'standby'" class="editor-session-standby">
    <section>
      <span class="standby-product">PIXIFACT EDITOR</span>
      <h1>{{ standbyReason === 'takenOver' ? '此标签页已停止编辑' : '项目已在另一个标签页中打开' }}</h1>
      <div class="standby-context">
        <span>项目</span>
        <strong>{{ project?.name }}</strong>
        <span>当前 Scene</span>
        <strong>{{ standbyScenePath ?? '尚未打开 Scene' }}</strong>
      </div>
      <button
        type="button"
        class="takeover-button"
        :aria-label="standbyReason === 'takenOver' ? '重新接管' : '在此接管'"
        :disabled="takeoverPending"
        @click="requestTakeover"
      >
        {{ takeoverPending ? '正在接管…' : (standbyReason === 'takenOver' ? '重新接管' : '在此接管') }}
      </button>
      <p v-if="sessionStateMessage" class="standby-error">{{ sessionStateMessage }}</p>
      <p class="standby-note">接管后，另一个标签页将停止编辑。Undo / Redo 和画布视图不会迁移。</p>
    </section>
  </main>
  <main v-else class="editor-shell">
    <header class="topbar">
      <div class="brand">PIXIFACT</div>
      <div class="scene-identity">
        <strong>{{ sceneName }}</strong>
        <span>{{ currentScenePath }}</span>
      </div>
      <div class="history-tools">
        <button
          type="button"
          title="返回"
          aria-label="返回"
          :disabled="!canNavigateBack"
          @click="navigateHistory(-1)"
        >
          <ArrowLeft :size="16" />
        </button>
        <button
          type="button"
          title="前进"
          aria-label="前进"
          :disabled="!canNavigateForward"
          @click="navigateHistory(1)"
        >
          <ArrowRight :size="16" />
        </button>
        <button
          type="button"
          title="刷新"
          aria-label="刷新"
          :disabled="!document || syncState !== 'synced' || refreshing"
          @click="refreshEditor"
        >
          <RefreshCw :size="16" />
        </button>
        <button type="button" title="撤销" aria-label="撤销" :disabled="!document?.canUndo" @click="undo">
          <Undo2 :size="16" />
        </button>
        <button type="button" title="重做" aria-label="重做" :disabled="!document?.canRedo" @click="redo">
          <Redo2 :size="16" />
        </button>
        <button
          type="button"
          class="save-button"
          title="保存 Scene（Ctrl/Cmd+S）"
          aria-label="保存 Scene"
          :disabled="!document?.dirty || syncState === 'saving'"
          @click="saveCurrentScene"
        >
          <Save :size="15" /> 保存
        </button>
      </div>
      <div class="sync-state" :data-state="syncState"><span />{{ syncLabel }}</div>
    </header>

    <nav class="scene-tabs" aria-label="打开的 Scene">
      <div
        v-for="tab in sceneTabs"
        :key="tab.path"
        class="scene-tab"
        :class="{ active: currentScenePath === tab.path }"
        :data-scene-tab="tab.path"
      >
        <button
          type="button"
          class="scene-tab-activate"
          :aria-label="`切换到 ${tab.path}`"
          :aria-current="currentScenePath === tab.path ? 'page' : undefined"
          :title="tab.path"
          @click="navigateToScene(tab.path)"
        >
          <span>{{ tab.path.split('/').at(-1) }}</span>
          <span v-if="tab.syncState === 'conflict' || tab.syncState === 'error'" class="scene-tab-status error">!</span>
          <span v-else-if="tab.document.dirty" class="scene-tab-status">●</span>
        </button>
        <button
          type="button"
          class="scene-tab-close"
          :aria-label="`关闭 ${tab.path}`"
          :title="`关闭 ${tab.path}`"
          :disabled="tab.syncState === 'saving'"
          @click="closeTab(tab.path)"
        ><X :size="13" /></button>
      </div>
    </nav>

    <section class="workspace">
      <aside class="left-panel">
        <TabsRoot v-model="activeLeftTab" class="left-tabs">
          <TabsList class="tab-list" aria-label="项目面板">
            <TabsTrigger class="tab-trigger" value="hierarchy">层级</TabsTrigger>
            <TabsTrigger class="tab-trigger" value="assets">资产</TabsTrigger>
          </TabsList>
          <TabsContent class="tab-content" value="hierarchy">
            <HierarchyPanel
              ref="hierarchyPanel"
              :document="document"
              :dragged-asset="draggedAsset"
              :revision="documentRevision"
              :selected="selectedLocator"
              @select="selectedLocator = $event"
              @open-scene="navigateToSceneReference"
              @asset-drop="endAssetDrag"
            />
          </TabsContent>
          <TabsContent class="tab-content" value="assets">
            <AssetsPanel
              :project="project"
              :current-scene="currentScenePath"
              :expanded-directories="assetTreeExpandedDirectories"
              :focus-asset="assetFocusRequest"
              @asset-drag-start="startAssetDrag"
              @asset-tree-expansion-change="saveAssetTreeExpansion"
              @open-scene="navigateToScene"
            />
          </TabsContent>
        </TabsRoot>
        <div class="left-panel-footer">
          <PopoverRoot>
            <PopoverTrigger class="settings-trigger" type="button" aria-label="设置" title="设置">
              <Settings2 :size="16" />
              <span>设置</span>
            </PopoverTrigger>
            <PopoverPortal>
              <PopoverContent class="editor-settings-popover" side="top" align="start" :side-offset="8">
                <div class="settings-heading">设置</div>
                <label class="settings-option">
                  <span>
                    <strong>自动保存</strong>
                    <small>编辑 Scene 后立即写入文件</small>
                  </span>
                  <input
                    type="checkbox"
                    :checked="autoSave"
                    aria-label="自动保存"
                    @change="changeAutoSave(($event.target as HTMLInputElement).checked)"
                  >
                </label>
              </PopoverContent>
            </PopoverPortal>
          </PopoverRoot>
        </div>
      </aside>

      <section class="canvas-panel" aria-label="Scene 画布">
        <SceneCanvas
          ref="sceneCanvas"
          :document="document"
          :dragged-asset="draggedAsset"
          :project-tree="projectTree"
          :scene-interfaces="sceneInterfaces"
          :selected="selectedLocator"
          @select="selectedLocator = $event"
          @open-scene="navigateToSceneReference"
          @asset-drop="endAssetDrag"
          @preview-state="previewState = $event"
        />
      </section>

      <aside class="right-panel">
        <div class="panel-title">INSPECTOR</div>
        <InspectorPanel
          :document="document"
          :dragged-asset="draggedAsset"
          :revision="documentRevision"
          :scene-interfaces="sceneInterfaces"
          :selected="selectedLocator"
          @asset-drop="endAssetDrag"
          @locate-asset="locateAsset"
        />
      </aside>
    </section>

    <div v-if="error" class="global-error">{{ error }}</div>

    <div v-if="closingPath" class="editor-modal-backdrop">
      <section ref="closeModal" class="editor-modal" role="dialog" aria-modal="true" aria-labelledby="close-scene-title" @keydown="handleModalKeyDown">
        <h2 id="close-scene-title">保存对 Scene 的修改？</h2>
        <p>{{ closingPath }} 有未保存的修改。</p>
        <div class="editor-modal-actions">
          <button type="button" @click="closingPath = undefined">取消</button>
          <button type="button" @click="discardAndCloseTab">放弃修改</button>
          <button type="button" class="primary" @click="saveAndCloseTab">保存并关闭</button>
        </div>
      </section>
    </div>

    <div v-if="conflict" class="editor-modal-backdrop">
      <section ref="conflictModal" class="editor-modal conflict-modal" role="dialog" aria-modal="true" aria-labelledby="conflict-scene-title" @keydown="handleModalKeyDown">
        <h2 id="conflict-scene-title">Scene 文件已在外部修改</h2>
        <p>{{ conflict.path }}：请选择保留哪个版本。覆盖操作会再次检查磁盘版本。</p>
        <div class="conflict-sources">
          <div><strong>Editor 草稿</strong><pre>{{ conflict.localSource }}</pre></div>
          <div><strong>磁盘版本</strong><pre>{{ conflict.diskSource }}</pre></div>
        </div>
        <div class="editor-modal-actions">
          <button type="button" @click="conflict = undefined">继续编辑草稿</button>
          <button type="button" @click="discardConflictedDraft">放弃草稿并载入磁盘</button>
          <button type="button" class="primary" @click="overwriteConflictedScene">用草稿覆盖磁盘</button>
        </div>
      </section>
    </div>
  </main>
</template>
