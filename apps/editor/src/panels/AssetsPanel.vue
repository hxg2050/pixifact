<script setup lang="ts">
import {
    ChevronDown,
    ChevronRight,
    Folder,
    FolderOpen,
    PanelsTopLeft,
} from 'lucide-vue-next';
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import type { EditorSceneAsset } from '../document/sceneTree';
import type { EditorProject, EditorProjectFile } from '../services/editorApi';

interface AssetFileNode {
    kind: 'image' | 'scene';
    name: string;
    path: string;
    type: 'file';
}

interface AssetDirectoryNode {
    children: AssetTreeNode[];
    name: string;
    path: string;
    type: 'directory';
}

type AssetTreeNode = AssetDirectoryNode | AssetFileNode;

interface MutableAssetDirectory {
    directories: Map<string, MutableAssetDirectory>;
    files: AssetFileNode[];
    name: string;
    path: string;
}

interface VisibleAssetNode {
    level: number;
    node: AssetTreeNode;
}

const props = defineProps<{
    currentScene?: string;
    expandedDirectories?: readonly string[];
    focusAsset?: { generation: number; path: string };
    project?: EditorProject;
}>();
const emit = defineEmits<{
    assetDragStart: [asset: EditorSceneAsset];
    assetTreeExpansionChange: [directories: string[]];
    openScene: [path: string];
}>();
const expandedDirectories = reactive(new Set<string>());
const focusedAssetPath = ref<string>();
const thumbnailGeneration = ref(0);
const assetList = ref<HTMLElement>();
let initializedProjectRoot: string | undefined;
let pendingDrag: {
    asset: EditorSceneAsset;
    pointerId: number;
    startX: number;
    startY: number;
} | undefined;

function createDirectory(name: string, path: string): MutableAssetDirectory {
    return {
        directories: new Map(),
        files: [],
        name,
        path,
    };
}

function toDirectoryNode(directory: MutableAssetDirectory): AssetDirectoryNode {
    const directories = [...directory.directories.values()]
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(toDirectoryNode);
    const files = directory.files
        .toSorted((left, right) => left.name.localeCompare(right.name));
    return {
        children: [...directories, ...files],
        name: directory.name,
        path: directory.path,
        type: 'directory',
    };
}

function buildAssetTree(files: EditorProjectFile[]) {
    const root = createDirectory('', '');
    for (const file of files) {
        if (file.kind !== 'scene' && file.kind !== 'image') continue;
        const segments = file.path.split('/');
        const name = segments.pop()!;
        let directory = root;
        for (const segment of segments) {
            const path = directory.path ? `${directory.path}/${segment}` : segment;
            let child = directory.directories.get(segment);
            if (!child) {
                child = createDirectory(segment, path);
                directory.directories.set(segment, child);
            }
            directory = child;
        }
        directory.files.push({
            kind: file.kind,
            name,
            path: file.path,
            type: 'file',
        });
    }
    const directories = [...root.directories.values()]
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(toDirectoryNode);
    const rootFiles = root.files
        .toSorted((left, right) => left.name.localeCompare(right.name));
    return [...directories, ...rootFiles];
}

const assetTree = computed(() => props.project ? buildAssetTree(props.project.files) : []);
const visibleAssets = computed(() => {
    const result: VisibleAssetNode[] = [];
    function visit(nodes: AssetTreeNode[], level: number) {
        for (const node of nodes) {
            result.push({ level, node });
            if (node.type === 'directory' && expandedDirectories.has(node.path)) {
                visit(node.children, level + 1);
            }
        }
    }
    visit(assetTree.value, 0);
    return result;
});

function sceneDirectoryPaths(scenePath: string) {
    const segments = scenePath.split('/');
    segments.pop();
    return segments.map((_, index) => segments.slice(0, index + 1).join('/'));
}

function assetDirectoryPaths(assetPath: string) {
    const segments = assetPath.split('/');
    segments.pop();
    return segments.map((_, index) => segments.slice(0, index + 1).join('/'));
}

async function focusAsset(path: string) {
    focusedAssetPath.value = path;
    for (const directory of assetDirectoryPaths(path)) {
        expandedDirectories.add(directory);
    }
    emit('assetTreeExpansionChange', [...expandedDirectories].toSorted());
    await nextTick();
    const element = Array.from(assetList.value?.querySelectorAll<HTMLElement>('[data-asset-path]') ?? [])
        .find((candidate) => candidate.dataset.assetPath === path);
    element?.scrollIntoView?.({ block: 'nearest' });
}

function initializeExpandedDirectories() {
    const projectRoot = props.project?.root;
    if (!projectRoot || initializedProjectRoot === projectRoot) return;
    const persistedDirectories = props.expandedDirectories;
    if (!persistedDirectories && !props.currentScene) return;
    expandedDirectories.clear();
    for (const path of persistedDirectories ?? sceneDirectoryPaths(props.currentScene!)) {
        expandedDirectories.add(path);
    }
    initializedProjectRoot = projectRoot;
}

function toggleDirectory(path: string) {
    if (!expandedDirectories.delete(path)) {
        expandedDirectories.add(path);
    }
    emit('assetTreeExpansionChange', [...expandedDirectories].toSorted());
}

function imageThumbnailUrl(path: string) {
    return `/api/file?path=${encodeURIComponent(path)}&generation=${thumbnailGeneration.value}`;
}

function prepareAssetDrag(event: PointerEvent, asset: EditorSceneAsset) {
    if (event.button !== 0) return;
    cancelPendingDrag();
    pendingDrag = {
        asset,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
    };
    window.addEventListener('pointermove', detectAssetDrag);
    window.addEventListener('pointerup', cancelPendingDrag, { once: true });
    window.addEventListener('pointercancel', cancelPendingDrag, { once: true });
}

function detectAssetDrag(event: PointerEvent) {
    const pending = pendingDrag;
    if (!pending || event.pointerId !== pending.pointerId) return;
    if (Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) < 4) return;
    const asset = pending.asset;
    cancelPendingDrag();
    emit('assetDragStart', asset);
}

function cancelPendingDrag() {
    window.removeEventListener('pointermove', detectAssetDrag);
    window.removeEventListener('pointerup', cancelPendingDrag);
    window.removeEventListener('pointercancel', cancelPendingDrag);
    pendingDrag = undefined;
}

watch(
    [() => props.project?.root, () => props.currentScene, () => props.expandedDirectories],
    initializeExpandedDirectories,
    { immediate: true },
);
watch(() => props.focusAsset, (request) => {
    if (request) void focusAsset(request.path);
}, { immediate: true });
watch(() => props.project, () => thumbnailGeneration.value += 1);
onBeforeUnmount(cancelPendingDrag);
</script>

<template>
  <div v-if="project" ref="assetList" class="asset-list">
    <div v-if="visibleAssets.length === 0" class="asset-empty">暂无 Scene 或图片</div>
    <template v-for="row in visibleAssets" :key="row.node.type + ':' + row.node.path">
      <button
        v-if="row.node.type === 'directory'"
        class="asset-row asset-directory"
        :style="{ paddingLeft: `${8 + row.level * 16}px` }"
        :data-asset-directory="row.node.path"
        :aria-expanded="expandedDirectories.has(row.node.path)"
        type="button"
        @click="toggleDirectory(row.node.path)"
      >
        <ChevronRight v-if="!expandedDirectories.has(row.node.path)" :size="14" />
        <ChevronDown v-else :size="14" />
        <Folder v-if="!expandedDirectories.has(row.node.path)" :size="15" />
        <FolderOpen v-else :size="15" />
        <span>{{ row.node.name }}</span>
      </button>
      <button
        v-else-if="row.node.kind === 'scene'"
        class="asset-row"
        :class="{
          'asset-draggable': row.node.path !== currentScene,
          selected: row.node.path === currentScene,
          focused: row.node.path === focusedAssetPath,
        }"
        :style="{ paddingLeft: `${8 + row.level * 16}px` }"
        :data-asset-path="row.node.path"
        :data-asset-draggable="row.node.path !== currentScene"
        :title="row.node.path"
        type="button"
        @dblclick="emit('openScene', row.node.path)"
        @pointerdown="row.node.path !== currentScene && prepareAssetDrag($event, { kind: 'scene', path: row.node.path })"
        @selectstart.prevent
      >
        <span class="asset-row-spacer" />
        <PanelsTopLeft :size="15" />
        <span>{{ row.node.name }}</span>
      </button>
      <div
        v-else
        class="asset-row asset-draggable"
        :class="{ focused: row.node.path === focusedAssetPath }"
        :style="{ paddingLeft: `${8 + row.level * 16}px` }"
        :data-asset-path="row.node.path"
        data-asset-draggable="true"
        :title="row.node.path"
        @pointerdown="prepareAssetDrag($event, { kind: 'image', path: row.node.path })"
        @selectstart.prevent
      >
        <span class="asset-row-spacer" />
        <img
          class="asset-thumbnail"
          :src="imageThumbnailUrl(row.node.path)"
          alt=""
          draggable="false"
        />
        <span>{{ row.node.name }}</span>
      </div>
    </template>
  </div>
</template>
