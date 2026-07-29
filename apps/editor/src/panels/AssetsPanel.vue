<script setup lang="ts">
import { FileImage, PanelsTopLeft } from 'lucide-vue-next';
import type { EditorProject } from '../services/editorApi';

defineProps<{ project?: EditorProject; currentScene?: string }>();
const emit = defineEmits<{ openScene: [path: string] }>();
</script>

<template>
  <div v-if="project" class="asset-list">
    <div class="asset-group-label">SCENES</div>
    <button
      v-for="scene in project.scenes"
      :key="scene"
      class="asset-row"
      :class="{ selected: scene === currentScene }"
      type="button"
      @dblclick="emit('openScene', scene)"
    >
      <PanelsTopLeft :size="15" />
      <span>{{ scene.split('/').at(-1) }}</span>
    </button>
    <div class="asset-group-label">IMAGES</div>
    <div v-if="project.images.length === 0" class="asset-empty">暂无图片</div>
    <div v-for="image in project.images" :key="image" class="asset-row readonly">
      <FileImage :size="15" />
      <span>{{ image.split('/').at(-1) }}</span>
    </div>
  </div>
</template>
