<script setup lang="ts">
import { X } from 'lucide-vue-next';
import { ref, watch } from 'vue';
import { readEditorProjectFile, type EditorProject } from '../services/editorApi';

const props = defineProps<{
    path: string;
    project?: EditorProject;
}>();
const emit = defineEmits<{ close: [] }>();
const preview = ref<{ url: string; bytes: number; width: number; height: number }>();
const loading = ref(true);
const error = ref('');

function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

watch([() => props.path, () => props.project], async ([path], _, onCleanup) => {
    let cancelled = false;
    let url: string | undefined;
    onCleanup(() => {
        cancelled = true;
        if (url) URL.revokeObjectURL(url);
    });
    preview.value = undefined;
    loading.value = true;
    error.value = '';
    try {
        const response = await readEditorProjectFile(path);
        const blob = await response.blob();
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        const image = new Image();
        image.src = url;
        await image.decode();
        if (cancelled) return;
        preview.value = {
            url,
            bytes: blob.size,
            width: image.naturalWidth,
            height: image.naturalHeight,
        };
    } catch (cause) {
        if (!cancelled) error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
        if (!cancelled) loading.value = false;
    }
}, { immediate: true });
</script>

<template>
  <section class="asset-preview-panel" aria-label="素材预览" data-asset-preview>
    <header class="asset-preview-heading">
      <strong>素材预览</strong>
      <button type="button" title="关闭素材预览" aria-label="关闭素材预览" @click="emit('close')">
        <X :size="14" />
      </button>
    </header>
    <div class="asset-preview-image">
      <span v-if="loading">正在加载图片…</span>
      <span v-else-if="error">{{ error }}</span>
      <img v-else-if="preview" :src="preview.url" :alt="path.split('/').at(-1)" draggable="false" />
    </div>
    <div class="asset-preview-details">
      <strong :title="path">{{ path }}</strong>
      <span v-if="preview">
        {{ path.toLowerCase().endsWith('.svg') ? '矢量图' : `${preview.width} × ${preview.height} px` }}
        · {{ formatFileSize(preview.bytes) }}
      </span>
    </div>
  </section>
</template>
