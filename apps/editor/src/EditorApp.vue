<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { Redo2, RefreshCw, Undo2 } from 'lucide-vue-next';
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui';
import { computed, markRaw, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { SceneTemplateInterface } from 'pixifact/compiler';
import AssetsPanel from './panels/AssetsPanel.vue';
import HierarchyPanel from './panels/HierarchyPanel.vue';
import InspectorPanel from './panels/InspectorPanel.vue';
import SceneCanvas from './preview/SceneCanvas.vue';
import { SceneDocument } from './document/SceneDocument';
import { remapSceneSelection, type EditorSceneAsset } from './document/sceneTree';
import {
    connectEditorSession,
    createEditorProjectTree,
    editorSceneFileApi,
    readEditorSceneBindings,
    readEditorProject,
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
const document = ref<SceneDocument>();
const documentRevision = ref(0);
const error = ref('');
const draggedAsset = ref<EditorSceneAsset>();
const refreshing = ref(false);
const sessionState = ref<'connecting' | 'active' | 'standby'>('connecting');
const sessionStateMessage = ref('');
const standbyReason = ref<'takenOver'>();
const standbyScenePath = ref<string>();
const takeoverPending = ref(false);
let unsubscribeDocument: (() => void) | undefined;
let sessionConnection: EditorSessionConnection | undefined;
let sessionStateRevision = 0;
let projectChangeTimer: ReturnType<typeof setTimeout> | undefined;
let projectRefreshQueue = Promise.resolve();
const pendingProjectChanges = new Set<string>();

const sceneName = computed(() => currentScenePath.value?.split('/').at(-1)?.replace(/\.scene$/, '') ?? '未打开 Scene');
const syncLabel = computed(() => ({
    synced: '已同步',
    saving: '正在写入',
    conflict: '同步冲突',
    error: '写入失败',
}[syncState.value]));

function bindDocument(next: SceneDocument, selection?: string) {
    unsubscribeDocument?.();
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

async function openScene(path: string, selection?: string) {
    const revision = sessionStateRevision;
    error.value = '';
    try {
        const next = await SceneDocument.open(path, editorSceneFileApi);
        if (sessionState.value !== 'active' || revision !== sessionStateRevision) return;
        bindDocument(next, selection);
    } catch (cause) {
        error.value = cause instanceof Error ? cause.message : String(cause);
    }
}

async function readSceneInterfaces() {
    const descriptors = await readEditorSceneBindings();
    return Object.fromEntries(
        Object.entries(descriptors).map(([scenePath, descriptor]) => [scenePath, descriptor.interface]),
    );
}

async function refreshSceneInterfaces() {
    sceneInterfaces.value = await readSceneInterfaces();
}

async function refreshOpenedScene(path: string) {
    const current = document.value;
    if (!current || current.path !== path) return;
    try {
        const latest = await current.reloadIfChanged();
        if (latest && document.value === current) {
            const selection = remapSceneSelection(current.template, latest.template, selectedLocator.value);
            bindDocument(latest, selection);
            error.value = '';
        }
    } catch (cause) {
        selectedLocator.value = undefined;
        throw cause;
    }
}

async function applyProjectChanges(paths: readonly string[]) {
    if (currentScenePath.value && paths.includes(currentScenePath.value)) {
        await refreshOpenedScene(currentScenePath.value);
    }
    if (paths.some((path) => path.endsWith('.ts'))) {
        await refreshSceneInterfaces();
    }
}

function scheduleProjectChange(path: string) {
    pendingProjectChanges.add(path);
    if (projectChangeTimer) clearTimeout(projectChangeTimer);
    projectChangeTimer = window.setTimeout(() => {
        projectChangeTimer = undefined;
        const paths = [...pendingProjectChanges];
        pendingProjectChanges.clear();
        projectRefreshQueue = projectRefreshQueue
            .then(() => applyProjectChanges(paths))
            .catch((cause) => {
                error.value = cause instanceof Error ? cause.message : String(cause);
            });
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
        },
        selection: editorSelectionContext(current.template, selectedLocator.value),
    });
}

watch([document, documentRevision, selectedLocator, syncState], publishEditorContext, { flush: 'post' });

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

function startAssetDrag(asset: EditorSceneAsset) {
    draggedAsset.value = asset;
    activeLeftTab.value = 'hierarchy';
}

function endAssetDrag() {
    draggedAsset.value = undefined;
}

function clearWorkspace() {
    unsubscribeDocument?.();
    unsubscribeDocument = undefined;
    document.value = undefined;
    projectTree.value = undefined;
    sceneInterfaces.value = {};
    currentScenePath.value = undefined;
    selectedLocator.value = undefined;
    syncState.value = 'synced';
    documentRevision.value += 1;
    draggedAsset.value = undefined;
    refreshing.value = false;
    pendingProjectChanges.clear();
    if (projectChangeTimer) {
        clearTimeout(projectChangeTimer);
        projectChangeTimer = undefined;
    }
}

async function loadActiveWorkspace(resume?: EditorSessionResumeState) {
    const revision = sessionStateRevision;
    error.value = '';
    const [nextProject, nextSceneInterfaces] = await Promise.all([
        readEditorProject(),
        readSceneInterfaces(),
    ]);
    if (sessionState.value !== 'active' || revision !== sessionStateRevision) return;
    project.value = nextProject;
    projectTree.value = createEditorProjectTree(nextProject);
    sceneInterfaces.value = nextSceneInterfaces;
    const scenePath = resume?.scenePath ?? nextProject.scenes[0];
    if (scenePath) {
        await openScene(scenePath, resume?.selectedLocator);
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
        );
        sessionConnection = connection;
        await applyEditorSessionState(connection.initialState);
    } catch (cause) {
        error.value = cause instanceof Error ? cause.message : String(cause);
    }
});

onBeforeUnmount(() => {
    window.removeEventListener('pointerup', endAssetDrag);
    window.removeEventListener('pointercancel', endAssetDrag);
    if (projectChangeTimer) clearTimeout(projectChangeTimer);
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
              :document="document"
              :dragged-asset="draggedAsset"
              :revision="documentRevision"
              :selected="selectedLocator"
              @select="selectedLocator = $event"
              @asset-drop="endAssetDrag"
            />
          </TabsContent>
          <TabsContent class="tab-content" value="assets">
            <AssetsPanel
              :project="project"
              :current-scene="currentScenePath"
              @asset-drag-start="startAssetDrag"
              @open-scene="openScene"
            />
          </TabsContent>
        </TabsRoot>
      </aside>

      <section class="canvas-panel" aria-label="Scene 画布">
        <SceneCanvas
          :document="document"
          :dragged-asset="draggedAsset"
          :project-tree="projectTree"
          :scene-interfaces="sceneInterfaces"
          :selected="selectedLocator"
          @select="selectedLocator = $event"
          @asset-drop="endAssetDrag"
        />
      </section>

      <aside class="right-panel">
        <div class="panel-title">INSPECTOR</div>
        <InspectorPanel
          :document="document"
          :revision="documentRevision"
          :scene-interfaces="sceneInterfaces"
          :selected="selectedLocator"
        />
      </aside>
    </section>

    <div v-if="error" class="global-error">{{ error }}</div>
  </main>
</template>
