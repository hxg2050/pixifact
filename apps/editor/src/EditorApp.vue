<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { ArrowLeft, ArrowRight, Redo2, RefreshCw, Undo2 } from 'lucide-vue-next';
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui';
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
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
const document = ref<SceneDocument>();
const documentRevision = ref(0);
const error = ref('');
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
let unsubscribeDocument: (() => void) | undefined;
let sessionConnection: EditorSessionConnection | undefined;
let sessionStateRevision = 0;
let projectChangeTimer: ReturnType<typeof setTimeout> | undefined;
let projectChangeGeneration = 0;
let projectRefreshRunning = false;
let editorDisposed = false;
let sceneOpenGeneration = 0;
let assetTreeStateSaveGeneration = 0;
let assetTreeStateSaving = false;
let assetFocusGeneration = 0;
const pendingProjectChanges = new Set<string>();

interface SceneNavigationEntry {
    path: string;
    selectedLocator?: string;
    view?: SceneCanvasView;
}

const sceneName = computed(() => currentScenePath.value?.split('/').at(-1)?.replace(/\.scene$/, '') ?? '未打开 Scene');
const syncLabel = computed(() => ({
    synced: '已同步',
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

function bindDocument(next: SceneDocument, selection?: string) {
    unsubscribeDocument?.();
    previewState.value = 'loading';
    document.value = markRaw(next);
    currentScenePath.value = next.path;
    selectedLocator.value = selection;
    syncState.value = next.syncState;
    documentRevision.value += 1;
    unsubscribeDocument = next.subscribe((event) => {
        if (event.type === 'syncStateChanged') {
            syncState.value = event.state;
        }
        if (event.type === 'commandApplied') {
            documentRevision.value += 1;
            selectedLocator.value = event.selection?.type === 'node'
                ? event.selection.node
                : undefined;
        }
    });
}

async function openScene(path: string, selection?: string, restoredView?: SceneCanvasView) {
    const revision = sessionStateRevision;
    const generation = ++sceneOpenGeneration;
    error.value = '';
    try {
        const next = await SceneDocument.open(path, editorSceneFileApi);
        if (
            sessionState.value !== 'active'
            || revision !== sessionStateRevision
            || generation !== sceneOpenGeneration
        ) return false;
        bindDocument(next, selection);
        await nextTick();
        if (document.value !== next || generation !== sceneOpenGeneration) return false;
        if (restoredView) sceneCanvas.value?.restoreView?.(restoredView);
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

function resetSceneNavigation(path: string, selectedLocator?: string) {
    navigationEntries.value = [{ path, selectedLocator }];
    navigationIndex.value = 0;
}

function captureCurrentNavigationEntry() {
    const entry = navigationEntries.value[navigationIndex.value];
    if (!entry || entry.path !== document.value?.path) return;
    navigationEntries.value[navigationIndex.value] = {
        ...entry,
        selectedLocator: selectedLocator.value,
        view: sceneCanvas.value?.captureView?.() ?? entry.view,
    };
}

async function navigateToScene(path: string) {
    if (navigationPending.value || path === document.value?.path) return;
    navigationPending.value = true;
    captureCurrentNavigationEntry();
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
    captureCurrentNavigationEntry();
    try {
        if (!await openScene(target.path, target.selectedLocator, target.view)) return;
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
    const currentSceneChanged = !!current && paths.includes(current.path);
    const currentSceneReload = currentSceneChanged && current
        ? current.reloadIfChanged().catch((cause) => {
            if (projectChangeIsCurrent(generation) && document.value === current) {
                selectedLocator.value = undefined;
            }
            throw cause;
        })
        : undefined;
    const [nextProject, nextSceneInterfaces, latest] = await Promise.all([
        projectIndexChanged
            ? indexedProject === currentProject ? readEditorProject() : indexedProject
            : undefined,
        pairedScriptChanged ? readSceneInterfaces() : undefined,
        currentSceneReload,
    ]);
    if (!projectChangeIsCurrent(generation)) return;
    if (nextProject) {
        project.value = nextProject;
        projectTree.value = createEditorProjectTree(nextProject);
    }
    if (nextSceneInterfaces) {
        sceneInterfaces.value = nextSceneInterfaces;
    }
    if (latest && current && document.value === current) {
        const selection = remapSceneSelection(current.template, latest.template, selectedLocator.value);
        bindDocument(latest, selection);
    }
    error.value = '';
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
    });
}

watch([document, documentRevision, selectedLocator, syncState, previewState], publishEditorContext, { flush: 'post' });

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
        if (latest) bindDocument(latest, selection);
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
    if (
        sessionState.value !== 'active'
        || !document.value
        || event.repeat
        || event.altKey
        || eventTargetsEditableControl(event)
    ) return;
    const commandKey = event.metaKey || event.ctrlKey;
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
    assetTreeStateSaveGeneration += 1;
    if (!assetTreeStateSaving) void flushAssetTreeState();
}

async function flushAssetTreeState() {
    assetTreeStateSaving = true;
    try {
        while (true) {
            const saveGeneration = assetTreeStateSaveGeneration;
            await writeEditorUiState(assetTreeExpandedDirectories.value ?? []);
            if (saveGeneration === assetTreeStateSaveGeneration) return;
        }
    } catch (cause) {
        error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
        assetTreeStateSaving = false;
    }
}

function endAssetDrag() {
    draggedAsset.value = undefined;
}

function clearWorkspace() {
    projectChangeGeneration += 1;
    sceneOpenGeneration += 1;
    unsubscribeDocument?.();
    unsubscribeDocument = undefined;
    document.value = undefined;
    assetTreeExpandedDirectories.value = undefined;
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
    const scenePath = resume?.scenePath ?? nextProject.scenes[0];
    if (scenePath) {
        if (await openScene(scenePath, resume?.selectedLocator)) {
            resetSceneNavigation(scenePath, resume?.selectedLocator);
        }
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
    if (projectChangeTimer) clearTimeout(projectChangeTimer);
    projectChangeGeneration += 1;
    pendingProjectChanges.clear();
    unsubscribeDocument?.();
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
      </div>
      <div class="sync-state" :data-state="syncState"><span />{{ syncLabel }}</div>
    </header>

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
  </main>
</template>
