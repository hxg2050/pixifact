<script setup lang="ts">
import { computed } from 'vue';
import HierarchyNode from '../components/HierarchyNode.vue';
import type { SceneDocument } from '../document/SceneDocument';
import { sceneTreeEntries } from '../document/sceneTree';

const props = defineProps<{
    document?: SceneDocument;
    revision: number;
    selected?: string;
}>();
const emit = defineEmits<{ select: [locator?: string] }>();
const entries = computed(() => {
    void props.revision;
    return props.document ? sceneTreeEntries(props.document.template.children) : [];
});
</script>

<template>
  <div v-if="document" class="hierarchy-panel">
    <button
      class="tree-row scene-root"
      :class="{ selected: selected === undefined }"
      type="button"
      @click="emit('select', undefined)"
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
        :selected="selected"
        @select="emit('select', $event)"
      />
    </ul>
  </div>
  <div v-else class="panel-empty">项目中没有可打开的 Scene</div>
</template>
