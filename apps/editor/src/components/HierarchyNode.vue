<script setup lang="ts">
import { ChevronDown, ChevronRight, Component, Image, Layers3, Type } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import type { SceneTreeDropTarget, SceneTreeEntry } from '../document/sceneTree';

const props = defineProps<{
    entry: SceneTreeEntry;
    level: number;
    dropTarget?: SceneTreeDropTarget;
    selected?: string;
}>();
const emit = defineEmits<{
    dragEnd: [];
    dragOver: [target: SceneTreeDropTarget];
    dragStart: [locator: string];
    drop: [target: SceneTreeDropTarget];
    select: [locator: string];
}>();
const expanded = ref(true);
const hasChildren = computed(() => props.entry.children.length > 0);
const label = computed(() => {
    const node = props.entry.node;
    if (node.kind === 'slotOutlet') {
        return `Slot · ${node.name}`;
    }
    return node.id || (node.kind === 'sceneInstance' ? node.type : node.type);
});
const icon = computed(() => {
    const node = props.entry.node;
    if (node.kind === 'sceneInstance') return Component;
    if (node.kind === 'pixi' && ['Image', 'NineImage', 'TileImage', 'Sprite'].includes(node.type)) return Image;
    if (node.kind === 'pixi' && ['Label', 'BitmapLabel', 'Text', 'BitmapText', 'HTMLText'].includes(node.type)) return Type;
    return Layers3;
});

function calculateDropTarget(event: DragEvent): SceneTreeDropTarget {
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const height = bounds.height || 27;
    const ratio = (event.clientY - bounds.top) / height;
    if (props.entry.acceptsChildren && ratio >= 0.25 && ratio <= 0.75) {
        return {
            index: props.entry.children.length,
            locator: props.entry.locator,
            mode: 'inside',
            parent: props.entry.locator,
        };
    }
    const after = ratio > 0.5;
    return {
        index: props.entry.index + (after ? 1 : 0),
        locator: props.entry.locator,
        mode: after ? 'after' : 'before',
        parent: props.entry.parentLocator,
    };
}

function handleDragStart(event: DragEvent) {
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', props.entry.locator);
    }
    emit('dragStart', props.entry.locator);
}

function handleDragOver(event: DragEvent) {
    emit('dragOver', calculateDropTarget(event));
}

function handleDrop(event: DragEvent) {
    const target = props.dropTarget?.locator === props.entry.locator
        ? props.dropTarget
        : calculateDropTarget(event);
    emit('drop', target);
}
</script>

<template>
  <li>
    <button
      class="tree-row"
      :class="{
        selected: selected === entry.locator,
        'drop-before': props.dropTarget?.locator === entry.locator && props.dropTarget.mode === 'before',
        'drop-inside': props.dropTarget?.locator === entry.locator && props.dropTarget.mode === 'inside',
        'drop-after': props.dropTarget?.locator === entry.locator && props.dropTarget.mode === 'after',
      }"
      :data-locator="entry.locator"
      draggable="true"
      :style="{ paddingLeft: `${8 + level * 16}px` }"
      type="button"
      @click="emit('select', entry.locator)"
      @dragend="emit('dragEnd')"
      @dragover.prevent.stop="handleDragOver"
      @dragstart="handleDragStart"
      @drop.prevent.stop="handleDrop"
    >
      <span
        class="tree-disclosure"
        :class="{ empty: !hasChildren }"
        @click.stop="hasChildren && (expanded = !expanded)"
      >
        <ChevronDown v-if="hasChildren && expanded" :size="13" />
        <ChevronRight v-else-if="hasChildren" :size="13" />
      </span>
      <component :is="icon" :size="14" class="tree-icon" />
      <span class="tree-label">{{ label }}</span>
      <small>{{ entry.node.kind === 'sceneInstance' ? 'Scene' : entry.node.kind === 'pixi' ? entry.node.type : 'Slot' }}</small>
    </button>
    <ul v-if="hasChildren && expanded" class="tree-list">
      <HierarchyNode
        v-for="child in entry.children"
        :key="child.locator"
        :entry="child"
        :level="level + 1"
        :drop-target="props.dropTarget"
        :selected="selected"
        @drag-end="emit('dragEnd')"
        @drag-over="emit('dragOver', $event)"
        @drag-start="emit('dragStart', $event)"
        @drop="emit('drop', $event)"
        @select="emit('select', $event)"
      />
    </ul>
  </li>
</template>
