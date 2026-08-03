<script setup lang="ts">
import { FileImage, PanelsTopLeft } from 'lucide-vue-next';
import { onBeforeUnmount } from 'vue';
import type { EditorSceneAsset } from '../document/sceneTree';
import type { EditorProject } from '../services/editorApi';

defineProps<{ project?: EditorProject; currentScene?: string }>();
const emit = defineEmits<{
    assetDragStart: [asset: EditorSceneAsset];
    openScene: [path: string];
}>();
let pendingDrag: {
    asset: EditorSceneAsset;
    pointerId: number;
    startX: number;
    startY: number;
} | undefined;

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
    <div class="asset-group-label">SCENES</div>
    <button
      v-for="scene in project.scenes"
      :key="scene"
      class="asset-row"
      :class="{ selected: scene === currentScene }"
      :data-asset-path="scene"
      :data-asset-draggable="scene !== currentScene"
      type="button"
      @dblclick="emit('openScene', scene)"
      @pointerdown="scene !== currentScene && prepareAssetDrag($event, { kind: 'scene', path: scene })"
    >
      <PanelsTopLeft :size="15" />
      <span>{{ scene.split('/').at(-1) }}</span>
    </button>
    <div class="asset-group-label">IMAGES</div>
    <div v-if="project.images.length === 0" class="asset-empty">暂无图片</div>
    <div
      v-for="image in project.images"
      :key="image"
      class="asset-row asset-draggable"
      :data-asset-path="image"
      data-asset-draggable="true"
      @pointerdown="prepareAssetDrag($event, { kind: 'image', path: image })"
    >
      <FileImage :size="15" />
      <span>{{ image.split('/').at(-1) }}</span>
    </div>
  </div>
</template>
