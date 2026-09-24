<script setup lang="ts">
import { ChevronRight, Copy, Plus, Search, Trash2 } from 'lucide-vue-next';
import {
    pixiSceneAddableNodeTypes,
    type PixiSceneNodeType,
    type SceneTemplateNode,
} from 'pixifact/compiler';
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import {
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuLabel,
    ContextMenuPortal,
    ContextMenuRoot,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
    ContextMenuTrigger,
} from 'reka-ui';
import HierarchyNode from '../components/HierarchyNode.vue';
import type { SceneDocument } from '../document/SceneDocument';
import {
    createPixiSceneNode,
    createSceneAssetNode,
    duplicateSceneNodes,
    findSceneTreeEntry,
    sceneTreeEntries,
    selectedSceneTreeRoots,
    type SceneTreeDropTarget,
    type SceneTreeEntry,
    type EditorSceneAsset,
} from '../document/sceneTree';

const props = defineProps<{
    document?: SceneDocument;
    draggedAsset?: EditorSceneAsset;
    revision: number;
    selected?: string;
    selections: string[];
}>();
const emit = defineEmits<{
    assetDrop: [];
    openScene: [reference: string];
    select: [selection: { locators: string[]; primary?: string }];
}>();
const search = ref('');
const addMenu = ref<HTMLDetailsElement>();
const draggedLocator = ref<string>();
const dropTarget = ref<SceneTreeDropTarget>();
const copiedNodes = shallowRef<SceneTemplateNode[]>([]);
const contextTarget = ref<string>();
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
const selectedRoots = computed(() => props.document
    ? selectedSceneTreeRoots(props.document.template.children, props.selections)
    : []);
const canDuplicate = computed(() => selectedRoots.value.some((entry) => entry.node.kind !== 'slotOutlet'));
const canDelete = computed(() => selectedRoots.value.length > 0);
const canPaste = computed(() => copiedNodes.value.length > 0);
const canCopyContext = computed(() => canDuplicate.value);
const canDeleteContext = computed(() => canDelete.value);
const isDragging = computed(() => !!draggedLocator.value || !!props.draggedAsset);
const addGroups = [
    { label: '容器', types: ['Group', 'GridContainer', 'HBoxContainer', 'ScrollContainer', 'VBoxContainer', 'Container'] },
    { label: '绘制', types: ['Rect', 'Graphics'] },
    { label: '文字', types: ['Label', 'BitmapLabel', 'Text', 'BitmapText', 'HTMLText'] },
    { label: '图片', types: ['Image', 'NineImage', 'TileImage', 'Sprite', 'NineSliceSprite', 'TilingSprite'] },
] satisfies { label: string; types: PixiSceneNodeType[] }[];

function insertionTarget(locator?: string) {
    if (locator === undefined) {
        return { parent: '__scene__', index: entries.value.length };
    }
    const entry = props.document && findSceneTreeEntry(props.document.template.children, locator);
    if (!entry) {
        error.value = '目标节点已变化，请重新操作';
        return;
    }
    if (entry.acceptsChildren) {
        return { parent: entry.locator, index: entry.children.length };
    }
    return { parent: entry.parentLocator, index: entry.index + 1 };
}

async function addNode(type: PixiSceneNodeType, locator?: string) {
    if (!props.document || !pixiSceneAddableNodeTypes.includes(type)) return;
    if (addMenu.value) addMenu.value.open = false;
    const target = insertionTarget(locator);
    if (!target) return;
    await commit({
        op: 'insertNode',
        parent: target.parent,
        index: target.index,
        node: createPixiSceneNode(props.document.template, type),
    });
}

async function copyNode() {
    const document = props.document;
    if (!document) return;
    const roots = selectedRoots.value.filter((entry) => entry.node.kind !== 'slotOutlet');
    const copies = duplicateSceneNodes(document.template, roots.map((entry) => entry.node));
    if (copies.length === 0) return;
    await commit({
        op: 'batch',
        commands: roots.map((entry, index) => ({
            op: 'insertNode' as const,
            parent: entry.parentLocator,
            index: entry.index + 1,
            node: copies[index],
        })).reverse(),
    });
}

function copyToClipboard() {
    copiedNodes.value = selectedRoots.value
        .filter((entry) => entry.node.kind !== 'slotOutlet')
        .map((entry) => structuredClone(entry.node));
}

async function pasteNode(locator?: string) {
    const document = props.document;
    if (!document || copiedNodes.value.length === 0) return;
    const target = insertionTarget(locator);
    if (!target) return;
    const copies = duplicateSceneNodes(document.template, copiedNodes.value);
    await commit({
        op: 'batch',
        commands: copies.map((node, offset) => ({
            op: 'insertNode' as const,
            parent: target.parent,
            index: target.index + offset,
            node,
        })),
    });
}

async function deleteNode() {
    const roots = selectedRoots.value;
    if (roots.length === 0) return;
    await commit({
        op: 'batch',
        commands: [...roots].reverse().map((entry) => ({ op: 'deleteNode', node: entry.locator })),
    });
}

function prepareContextMenu(event: MouseEvent) {
    const row = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-locator]') : null;
    if (!row) {
        event.preventDefault();
        return;
    }
    contextTarget.value = row.dataset.locator === '__scene__' ? undefined : row.dataset.locator;
    if (contextTarget.value && props.selections.includes(contextTarget.value)) return;
    emit('select', { locators: contextTarget.value ? [contextTarget.value] : [], primary: contextTarget.value });
}

function selectNode(locator: string, event: MouseEvent) {
    if (event.shiftKey && props.selected) {
        const rows = Array.from(event.currentTarget instanceof Element
            ? event.currentTarget.closest('.hierarchy-tree')?.querySelectorAll<HTMLElement>('.tree-row[data-locator]') ?? []
            : []);
        const visible = rows.map((row) => row.dataset.locator).filter((value): value is string => !!value && value !== '__scene__');
        const start = visible.indexOf(props.selected);
        const end = visible.indexOf(locator);
        if (start >= 0 && end >= 0) {
            const range = visible.slice(Math.min(start, end), Math.max(start, end) + 1);
            emit('select', { locators: event.metaKey || event.ctrlKey ? [...new Set([...props.selections, ...range])] : range, primary: locator });
            return;
        }
    }
    if (event.metaKey || event.ctrlKey) {
        const locators = props.selections.includes(locator)
            ? props.selections.filter((value) => value !== locator)
            : [...props.selections, locator];
        emit('select', { locators, primary: locators.includes(locator) ? locator : locators.at(-1) });
        return;
    }
    emit('select', { locators: [locator], primary: locator });
}

function copySelection() {
    copyToClipboard();
}

function pasteSelection() {
    void pasteNode(props.selected);
}

function startDrag(locator: string) {
    endDrag();
    draggedLocator.value = locator;
    dropTarget.value = undefined;
    if (!props.selections.includes(locator)) emit('select', { locators: [locator], primary: locator });
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

defineExpose({ cancelCurrentDrag, copySelection, duplicateSelection: copyNode, deleteSelection: deleteNode, pasteSelection });

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
            <button v-for="type in group.types" :key="type" type="button" :aria-label="`添加 ${type}`" @click="addNode(type, selected)">{{ type }}</button>
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
    <ContextMenuRoot>
      <ContextMenuTrigger as-child>
        <div class="hierarchy-tree" @contextmenu.capture="prepareContextMenu">
          <button
            class="tree-row scene-root"
            :class="{
              selected: selections.length === 0,
              'drop-inside': dropTarget?.locator === '__scene__',
            }"
            data-locator="__scene__"
            type="button"
            @click="emit('select', { locators: [] })"
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
              :selections="selections"
              @drag-over="updateDropTarget"
              @drag-start="startDrag"
              @asset-drop="dropAsset"
              @open-scene="emit('openScene', $event)"
              @select="selectNode"
            />
          </ul>
          <p v-if="search.trim() && visibleEntries.length === 0" class="panel-empty compact">没有匹配的节点</p>
        </div>
      </ContextMenuTrigger>
      <ContextMenuPortal>
        <ContextMenuContent class="hierarchy-context-menu" aria-label="节点操作" :collision-padding="8">
          <ContextMenuSub>
            <ContextMenuSubTrigger class="hierarchy-context-item">
              添加
              <ChevronRight :size="13" aria-hidden="true" />
            </ContextMenuSubTrigger>
            <ContextMenuPortal>
              <ContextMenuSubContent class="hierarchy-context-menu hierarchy-context-submenu" aria-label="添加节点" :side-offset="4" :collision-padding="8">
                <template v-for="group in addGroups" :key="group.label">
                  <ContextMenuLabel class="hierarchy-context-label">{{ group.label }}</ContextMenuLabel>
                  <ContextMenuItem v-for="type in group.types" :key="type" class="hierarchy-context-item" @select="addNode(type, contextTarget)">{{ type }}</ContextMenuItem>
                </template>
              </ContextMenuSubContent>
            </ContextMenuPortal>
          </ContextMenuSub>
          <ContextMenuItem class="hierarchy-context-item" :disabled="!canCopyContext" @select="copyToClipboard">复制</ContextMenuItem>
          <ContextMenuItem class="hierarchy-context-item" :disabled="!canPaste" @select="pasteNode(contextTarget)">粘贴</ContextMenuItem>
          <ContextMenuSeparator class="hierarchy-context-separator" />
          <ContextMenuItem class="hierarchy-context-item" :disabled="!canDeleteContext" @select="deleteNode">删除</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenuPortal>
    </ContextMenuRoot>
    <p v-if="error" class="inline-error">{{ error }}</p>
  </div>
  <div v-else class="panel-empty">项目中没有可打开的 Scene</div>
</template>
