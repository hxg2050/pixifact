<script setup lang="ts">
import { Copy, Plus, Trash2 } from 'lucide-vue-next';
import {
    pixiSceneAddableNodeTypes,
    type PixiSceneNodeType,
} from 'pixifact/compiler';
import { computed, ref } from 'vue';
import HierarchyNode from '../components/HierarchyNode.vue';
import type { SceneDocument } from '../document/SceneDocument';
import {
    createPixiSceneNode,
    duplicateSceneNode,
    findSceneTreeEntry,
    sceneTreeEntries,
    type SceneTreeDropTarget,
} from '../document/sceneTree';

const props = defineProps<{
    document?: SceneDocument;
    revision: number;
    selected?: string;
}>();
const emit = defineEmits<{ select: [locator?: string] }>();
const addType = ref<PixiSceneNodeType>('Group');
const draggedLocator = ref<string>();
const dropTarget = ref<SceneTreeDropTarget>();
const error = ref('');
const entries = computed(() => {
    void props.revision;
    return props.document ? sceneTreeEntries(props.document.template.children) : [];
});
const selectedEntry = computed(() => (
    props.document && props.selected
        ? findSceneTreeEntry(props.document.template.children, props.selected)
        : undefined
));
const canDuplicate = computed(() => !!selectedEntry.value && selectedEntry.value.node.kind !== 'slotOutlet');
const canDelete = computed(() => !!selectedEntry.value);
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

async function addNode() {
    if (!props.document || !pixiSceneAddableNodeTypes.includes(addType.value)) return;
    const target = insertionTarget();
    await commit({
        op: 'insertNode',
        parent: target.parent,
        index: target.index,
        node: createPixiSceneNode(props.document.template, addType.value),
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
    draggedLocator.value = locator;
    dropTarget.value = undefined;
    emit('select', locator);
}

function updateDropTarget(target: SceneTreeDropTarget) {
    dropTarget.value = canDrop(target) ? target : undefined;
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

function endDrag() {
    draggedLocator.value = undefined;
    dropTarget.value = undefined;
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
</script>

<template>
  <div v-if="document" class="hierarchy-panel">
    <div class="hierarchy-toolbar">
      <select v-model="addType" aria-label="节点类型" title="节点类型">
        <optgroup v-for="group in addGroups" :key="group.label" :label="group.label">
          <option v-for="type in group.types" :key="type" :value="type">{{ type }}</option>
        </optgroup>
      </select>
      <button type="button" title="添加节点" aria-label="添加节点" @click="addNode">
        <Plus :size="15" />
      </button>
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
      @dragover.prevent="updateDropTarget({ parent: '__scene__', index: entries.length, locator: '__scene__', mode: 'inside' })"
      @drop.prevent="dropTarget && dropNode(dropTarget)"
    >
      <span class="tree-disclosure empty" />
      <span class="scene-mark">S</span>
      <span class="tree-label">{{ document.template.name }}</span>
      <small>Scene</small>
    </button>
    <ul class="tree-list">
      <HierarchyNode
        v-for="entry in entries"
        :key="entry.locator"
        :entry="entry"
        :level="0"
        :drop-target="dropTarget"
        :selected="selected"
        @drag-end="endDrag"
        @drag-over="updateDropTarget"
        @drag-start="startDrag"
        @drop="dropNode"
        @select="emit('select', $event)"
      />
    </ul>
    <p v-if="error" class="inline-error">{{ error }}</p>
  </div>
  <div v-else class="panel-empty">项目中没有可打开的 Scene</div>
</template>
