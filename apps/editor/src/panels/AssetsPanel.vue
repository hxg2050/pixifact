<script setup lang="ts">
import {
    ChevronDown,
    ChevronRight,
    FileImage,
    Folder,
    FolderOpen,
    PanelsTopLeft,
} from 'lucide-vue-next';
import { computed, onBeforeUnmount, reactive } from 'vue';
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

const props = defineProps<{ project?: EditorProject; currentScene?: string }>();
const emit = defineEmits<{
    assetDragStart: [asset: EditorSceneAsset];
    openScene: [path: string];
}>();
const collapsedDirectories = reactive(new Set<string>());
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
            if (node.type === 'directory' && !collapsedDirectories.has(node.path)) {
                visit(node.children, level + 1);
            }
        }
    }
    visit(assetTree.value, 0);
    return result;
});

function toggleDirectory(path: string) {
    if (collapsedDirectories.delete(path)) return;
    collapsedDirectories.add(path);
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

onBeforeUnmount(cancelPendingDrag);
</script>

<template>
  <div v-if="project" class="asset-list">
    <div v-if="visibleAssets.length === 0" class="asset-empty">暂无 Scene 或图片</div>
    <template v-for="row in visibleAssets" :key="row.node.type + ':' + row.node.path">
      <button
        v-if="row.node.type === 'directory'"
        class="asset-row asset-directory"
        :style="{ paddingLeft: `${8 + row.level * 16}px` }"
        :data-asset-directory="row.node.path"
        :aria-expanded="!collapsedDirectories.has(row.node.path)"
        type="button"
        @click="toggleDirectory(row.node.path)"
      >
        <ChevronRight v-if="collapsedDirectories.has(row.node.path)" :size="14" />
        <ChevronDown v-else :size="14" />
        <Folder v-if="collapsedDirectories.has(row.node.path)" :size="15" />
        <FolderOpen v-else :size="15" />
        <span>{{ row.node.name }}</span>
      </button>
      <button
        v-else-if="row.node.kind === 'scene'"
        class="asset-row"
        :class="{
          'asset-draggable': row.node.path !== currentScene,
          selected: row.node.path === currentScene,
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
        :style="{ paddingLeft: `${8 + row.level * 16}px` }"
        :data-asset-path="row.node.path"
        data-asset-draggable="true"
        :title="row.node.path"
        @pointerdown="prepareAssetDrag($event, { kind: 'image', path: row.node.path })"
        @selectstart.prevent
      >
        <span class="asset-row-spacer" />
        <FileImage :size="15" />
        <span>{{ row.node.name }}</span>
      </div>
    </template>
  </div>
</template>
