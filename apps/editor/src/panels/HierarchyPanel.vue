<script setup lang="ts">
import { Copy, Plus, Search, Trash2 } from 'lucide-vue-next';
import {
    pixiSceneAddableNodeTypes,
    type PixiSceneNodeType,
} from 'pixifact/compiler';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import HierarchyNode from '../components/HierarchyNode.vue';
import type { SceneDocument } from '../document/SceneDocument';
import {
    createPixiSceneNode,
    createSceneAssetNode,
    duplicateSceneNode,
    findSceneTreeEntry,
    sceneTreeEntries,
    type SceneTreeDropTarget,
    type SceneTreeEntry,
    type EditorSceneAsset,
} from '../document/sceneTree';

const props = defineProps<{
    document?: SceneDocument;
    draggedAsset?: EditorSceneAsset;
    revision: number;
    selected?: string;
}>();
const emit = defineEmits<{
    assetDrop: [];
    openScene: [reference: string];
    select: [locator?: string];
}>();
const search = ref('');
const addMenu = ref<HTMLDetailsElement>();
const draggedLocator = ref<string>();
const dropTarget = ref<SceneTreeDropTarget>();
const error = ref('');
const entries = computed(() => {
    void props.revision;
    return props.document ? sceneTreeEntries(props.document.template.children) : [];
});
const visibleEntries = computed(() => {
    const query = search.value.trim().toLocaleLowerCase();
    if (!query) return entries.value;
    const filter = (entry: SceneTreeEntry): SceneTreeEntry | undefined => {
        const node = entry.node;
        const label = node.kind === 'slotOutlet'
            ? `${node.name} slot`
            : `${node.id ?? ''} ${node.type} ${node.kind === 'sceneInstance' ? node.scene : ''}`;
        if (label.toLocaleLowerCase().includes(query)) return entry;
        const children = entry.children.flatMap((child) => {
            const match = filter(child);
            return match ? [match] : [];
        });
        return children.length ? { ...entry, children } : undefined;
    };
    return entries.value.flatMap((entry) => {
        const match = filter(entry);
        return match ? [match] : [];
    });
});
const selectedEntry = computed(() => (
    props.document && props.selected
        ? findSceneTreeEntry(props.document.template.children, props.selected)
        : undefined
));
const canDuplicate = computed(() => !!selectedEntry.value && selectedEntry.value.node.kind !== 'slotOutlet');
const canDelete = computed(() => !!selectedEntry.value);
const isDragging = computed(() => !!draggedLocator.value || !!props.draggedAsset);
const addGroups = [
    { label: '容器', types: ['Group', 'GridContainer', 'HBoxContainer', 'ScrollContainer', 'VBoxContainer', 'Container'] },
    { label: '绘制', types: ['Rect', 'Graphics'] },
    { label: '文字', types: ['Label', 'BitmapLabel', 'Text', 'BitmapText', 'HTMLText'] },
    { label: '图片', types: ['Image', 'NineImage', 'TileImage', 'Sprite', 'NineSliceSprite', 'TilingSprite'] },
] satisfies { label: string; types: PixiSceneNodeType[] }[];

function insertionTarget() {
    const entry = selectedEntry.value;
    if (!entry) {
        return { parent: '__scene__', index: entries.value.length };
    }
    if (entry.acceptsChildren) {
        return { parent: entry.locator, index: entry.children.length };
    }
    return { parent: entry.parentLocator, index: entry.index + 1 };
}

async function addNode(type: PixiSceneNodeType) {
    if (!props.document || !pixiSceneAddableNodeTypes.includes(type)) return;
    if (addMenu.value) addMenu.value.open = false;
    const target = insertionTarget();
    await commit({
        op: 'insertNode',
        parent: target.parent,
        index: target.index,
        node: createPixiSceneNode(props.document.template, type),
    });
}

async function copyNode() {
    if (!props.document || !selectedEntry.value || selectedEntry.value.node.kind === 'slotOutlet') return;
    const entry = selectedEntry.value;
    await commit({
        op: 'insertNode',
        parent: entry.parentLocator,
        index: entry.index + 1,
        node: duplicateSceneNode(props.document.template, entry.node),
    });
}

async function deleteNode() {
    if (!props.selected) return;
    await commit({ op: 'deleteNode', node: props.selected });
}

function startDrag(locator: string) {
    endDrag();
    draggedLocator.value = locator;
    dropTarget.value = undefined;
    emit('select', locator);
    window.addEventListener('pointermove', clearDropTargetOutsideHierarchy);
    window.addEventListener('pointerup', finishDrag, { once: true });
    window.addEventListener('pointercancel', endDrag, { once: true });
}

function updateDropTarget(target: SceneTreeDropTarget) {
    dropTarget.value = props.draggedAsset || canDrop(target) ? target : undefined;
}

function canDrop(target: SceneTreeDropTarget) {
    if (!props.document || !draggedLocator.value) return false;
    const source = findSceneTreeEntry(props.document.template.children, draggedLocator.value);
    if (!source) return false;
    if (target.parent === source.locator || target.parent.startsWith(`${source.locator}/`)) return false;
    if (source.node.kind === 'slotOutlet' && target.parent === '__scene__') return false;
    let targetIndex = target.index;
    if (source.parentLocator === target.parent && source.index < targetIndex) {
        targetIndex -= 1;
    }
    return source.parentLocator !== target.parent || source.index !== targetIndex;
}

async function dropNode(target: SceneTreeDropTarget) {
    const node = draggedLocator.value;
    if (!node || !canDrop(target)) {
        endDrag();
        return;
    }
    endDrag();
    await commit({
        op: 'moveNode',
        node,
        parent: target.parent,
        index: target.index,
    });
}

async function dropAsset(target: SceneTreeDropTarget) {
    const asset = props.draggedAsset;
    if (!props.document || !asset) return;
    dropTarget.value = undefined;
    await commit({
        op: 'insertNode',
        parent: target.parent,
        index: target.index,
        node: createSceneAssetNode(props.document.template, asset),
    });
    emit('assetDrop');
}

function endDrag() {
    window.removeEventListener('pointermove', clearDropTargetOutsideHierarchy);
    window.removeEventListener('pointerup', finishDrag);
    window.removeEventListener('pointercancel', endDrag);
    draggedLocator.value = undefined;
    dropTarget.value = undefined;
}

function cancelCurrentDrag() {
    const active = !!draggedLocator.value;
    endDrag();
    return active;
}

defineExpose({ cancelCurrentDrag });

function clearDropTargetOutsideHierarchy(event: PointerEvent) {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest('.hierarchy-panel [data-locator]')) {
        dropTarget.value = undefined;
    }
}

function finishDrag() {
    const target = dropTarget.value;
    if (!target) {
        endDrag();
        return;
    }
    void dropNode(target);
}

async function commit(command: Parameters<SceneDocument['commitCommand']>[0]) {
    if (!props.document) return;
    error.value = '';
    try {
        await props.document.commitCommand(command);
    } catch (cause) {
        error.value = cause instanceof Error ? cause.message : String(cause);
    }
}

onBeforeUnmount(endDrag);
watch(() => props.draggedAsset, (asset) => {
    if (!asset && !draggedLocator.value) dropTarget.value = undefined;
});
</script>

<template>
  <div
    v-if="document"
    class="hierarchy-panel"
    :class="{ 'is-dragging': isDragging, 'is-asset-dragging': !!draggedAsset }"
  >
    <div class="hierarchy-toolbar">
      <label class="hierarchy-search">
        <Search :size="14" />
        <input v-model="search" type="search" aria-label="搜索节点" placeholder="搜索节点">
      </label>
      <details ref="addMenu" class="add-node-menu">
        <summary title="添加节点" aria-label="添加节点"><Plus :size="15" /></summary>
        <div class="add-node-options">
          <div v-for="group in addGroups" :key="group.label" class="add-node-group">
            <span>{{ group.label }}</span>
            <button v-for="type in group.types" :key="type" type="button" :aria-label="`添加 ${type}`" @click="addNode(type)">{{ type }}</button>
          </div>
        </div>
      </details>
      <button type="button" title="复制节点" aria-label="复制节点" :disabled="!canDuplicate" @click="copyNode">
        <Copy :size="14" />
      </button>
      <button type="button" title="删除节点" aria-label="删除节点" :disabled="!canDelete" @click="deleteNode">
        <Trash2 :size="14" />
      </button>
    </div>
    <button
      class="tree-row scene-root"
      :class="{
        selected: selected === undefined,
        'drop-inside': dropTarget?.locator === '__scene__',
      }"
      data-locator="__scene__"
      type="button"
      @click="emit('select', undefined)"
      @pointermove.stop="isDragging && updateDropTarget({ parent: '__scene__', index: entries.length, locator: '__scene__', mode: 'inside' })"
      @pointerup="draggedAsset && dropAsset({ parent: '__scene__', index: entries.length, locator: '__scene__', mode: 'inside' })"
    >
      <span class="tree-disclosure empty" />
      <span class="scene-mark">S</span>
      <span class="tree-label">{{ document.template.name }}</span>
      <small>Scene</small>
    </button>
    <ul class="tree-list">
      <HierarchyNode
        v-for="entry in visibleEntries"
        :key="entry.locator"
        :entry="entry"
        :level="0"
        :asset-dragging="!!draggedAsset"
        :drop-target="dropTarget"
        :dragging="!!draggedLocator"
        :searching="!!search.trim()"
        :selected="selected"
        @drag-over="updateDropTarget"
        @drag-start="startDrag"
        @asset-drop="dropAsset"
        @open-scene="emit('openScene', $event)"
        @select="emit('select', $event)"
      />
    </ul>
    <p v-if="search.trim() && visibleEntries.length === 0" class="panel-empty compact">没有匹配的节点</p>
    <p v-if="error" class="inline-error">{{ error }}</p>
  </div>
  <div v-else class="panel-empty">项目中没有可打开的 Scene</div>
</template>
