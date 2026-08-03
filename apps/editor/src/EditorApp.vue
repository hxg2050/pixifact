<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { Redo2, Undo2 } from 'lucide-vue-next';
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui';
import { computed, markRaw, onBeforeUnmount, onMounted, ref } from 'vue';
import type { SceneTemplateInterface } from 'pixifact/compiler';
import AssetsPanel from './panels/AssetsPanel.vue';
import HierarchyPanel from './panels/HierarchyPanel.vue';
import InspectorPanel from './panels/InspectorPanel.vue';
import SceneCanvas from './preview/SceneCanvas.vue';
import { SceneDocument } from './document/SceneDocument';
import type { EditorSceneAsset } from './document/sceneTree';
import {
    createEditorProjectTree,
    editorSceneFileApi,
    readEditorSceneBindings,
    readEditorProject,
    watchEditorProject,
    type EditorProject,
} from './services/editorApi';
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
let unsubscribeDocument: (() => void) | undefined;
let unwatchProject: (() => void) | undefined;

const sceneName = computed(() => currentScenePath.value?.split('/').at(-1)?.replace(/\.scene$/, '') ?? '未打开 Scene');
const syncLabel = computed(() => ({
    synced: '已同步',
    saving: '正在写入',
    conflict: '同步冲突',
    error: '写入失败',
}[syncState.value]));

function bindDocument(next: SceneDocument) {
    unsubscribeDocument?.();
    document.value = markRaw(next);
    currentScenePath.value = next.path;
    selectedLocator.value = undefined;
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

async function openScene(path: string) {
    error.value = '';
    try {
        bindDocument(await SceneDocument.open(path, editorSceneFileApi));
    } catch (cause) {
        error.value = cause instanceof Error ? cause.message : String(cause);
    }
}

async function refreshSceneInterfaces() {
    const descriptors = await readEditorSceneBindings();
    sceneInterfaces.value = Object.fromEntries(
        Object.entries(descriptors).map(([scenePath, descriptor]) => [scenePath, descriptor.interface]),
    );
}

async function refreshOpenedScene(path: string) {
    const current = document.value;
    if (!current || current.path !== path) return;
    const latest = await current.reloadIfChanged();
    if (latest && document.value === current) {
        bindDocument(latest);
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

onMounted(async () => {
    window.addEventListener('pointerup', endAssetDrag);
    window.addEventListener('pointercancel', endAssetDrag);
    try {
        const [nextProject] = await Promise.all([
            readEditorProject(),
            refreshSceneInterfaces(),
        ]);
        project.value = nextProject;
        projectTree.value = createEditorProjectTree(project.value);
        if (project.value.scenes[0]) {
            await openScene(project.value.scenes[0]);
        }
        unwatchProject = watchEditorProject((path) => {
            window.setTimeout(async () => {
                try {
                    await refreshOpenedScene(path);
                    if (path.endsWith('.ts')) {
                        await refreshSceneInterfaces();
                    }
                } catch (cause) {
                    error.value = cause instanceof Error ? cause.message : String(cause);
                }
            }, 30);
        });
    } catch (cause) {
        error.value = cause instanceof Error ? cause.message : String(cause);
    }
});

onBeforeUnmount(() => {
    window.removeEventListener('pointerup', endAssetDrag);
    window.removeEventListener('pointercancel', endAssetDrag);
    unsubscribeDocument?.();
    unwatchProject?.();
});
</script>

<template>
  <main class="editor-shell">
    <header class="topbar">
      <div class="brand">PIXIFACT</div>
      <div class="scene-identity">
        <strong>{{ sceneName }}</strong>
        <span>{{ currentScenePath }}</span>
      </div>
      <div class="history-tools">
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
