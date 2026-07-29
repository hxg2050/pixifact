<script setup lang="ts">
import { ChevronDown, ChevronRight, Component, Image, Layers3, Type } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import type { SceneTreeEntry } from '../document/sceneTree';

const props = defineProps<{
    entry: SceneTreeEntry;
    level: number;
    selected?: string;
}>();
const emit = defineEmits<{ select: [locator: string] }>();
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
    if (node.kind === 'pixi' && ['Text', 'BitmapText', 'HTMLText'].includes(node.type)) return Type;
    return Layers3;
});
</script>

<template>
  <li>
    <button
      class="tree-row"
      :class="{ selected: selected === entry.locator }"
      :style="{ paddingLeft: `${8 + level * 16}px` }"
      type="button"
      @click="emit('select', entry.locator)"
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
        :selected="selected"
        @select="emit('select', $event)"
      />
    </ul>
  </li>
</template>
