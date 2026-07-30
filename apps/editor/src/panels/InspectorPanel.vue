<script setup lang="ts">
import { RotateCcw } from 'lucide-vue-next';
import {
    isSceneTemplateBindingValue,
    isPixiSceneNodeType,
    pixiSceneDisplayProps,
    pixiSceneFieldSchema,
    pixiSceneNodeDefaults,
    pixiSceneNodePropKeys,
    pixiSceneTransformProps,
    resolveSceneReference,
    type PixiSceneFieldType,
    type SceneTemplateInterface,
    type SceneTemplatePropContract,
} from 'pixifact/compiler';
import { computed, nextTick, reactive, watch } from 'vue';
import type { SceneDocument } from '../document/SceneDocument';
import { findSceneNodeByLocator } from '../document/sceneTree';

interface InspectorField {
    explicit: boolean;
    key: string;
    options?: readonly (string | number)[];
    type: PixiSceneFieldType;
    value: string | number | boolean;
}

const props = defineProps<{
    document?: SceneDocument;
    revision: number;
    sceneInterfaces?: Record<string, SceneTemplateInterface>;
    selected?: string;
}>();

const drafts = reactive<Record<string, string | number | boolean>>({});
const error = reactive({ message: '' });
const selectedNode = computed(() => {
    void props.revision;
    return props.document && props.selected
        ? findSceneNodeByLocator(props.document.template.children, props.selected)
        : undefined;
});
const selectedTitle = computed(() => {
    if (!props.document) return '未打开 Scene';
    if (!selectedNode.value) return props.document.template.name;
    const node = selectedNode.value;
    if (node.kind === 'slotOutlet') return `Slot · ${node.name}`;
    return node.id || (node.kind === 'sceneInstance' ? node.type : node.type);
});
const selectedType = computed(() => {
    const node = selectedNode.value;
    if (!node) return 'Scene';
    if (node.kind === 'slotOutlet') return 'Slot';
    return node.kind === 'sceneInstance' ? `Scene · ${node.type}` : node.type;
});
const selectedInterface = computed(() => {
    const node = selectedNode.value;
    if (!props.document || node?.kind !== 'sceneInstance') return undefined;
    return props.sceneInterfaces?.[resolveSceneReference(props.document.path, node.scene)];
});

const commonDefaults: Record<string, string | number | boolean> = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    pivotX: 0,
    pivotY: 0,
    skewX: 0,
    skewY: 0,
    alpha: 1,
    visible: true,
    zIndex: 0,
    eventMode: 'passive',
    cursor: 'default',
    label: '',
};

const fields = computed<InspectorField[]>(() => {
    const node = selectedNode.value;
    if (!node || node.kind === 'slotOutlet') {
        return [];
    }
    const defaults = node.kind === 'pixi' && isPixiSceneNodeType(node.type)
        ? { ...commonDefaults, ...pixiSceneNodeDefaults(node.type) }
        : commonDefaults;
    const keys = node.kind === 'pixi' && isPixiSceneNodeType(node.type)
        ? [...new Set([...pixiSceneTransformProps, ...pixiSceneDisplayProps, ...pixiSceneNodePropKeys(node.type)])]
        : [...new Set([
            ...pixiSceneTransformProps,
            ...pixiSceneDisplayProps,
            ...Object.keys(selectedInterface.value?.props ?? {}),
            ...Object.keys(node.props),
        ])];
    return keys.flatMap((key) => {
        const contract = selectedInterface.value?.props[key];
        const schema = contract ? scenePropSchema(contract) : pixiSceneFieldSchema(key);
        const explicitValue = node.props[key];
        if (isSceneTemplateBindingValue(explicitValue)) {
            return [];
        }
        const value = explicitValue ?? (contract ? scenePropDefault(contract) : defaults[key]);
        if (!schema || value === undefined || typeof value === 'object') {
            return [];
        }
        return [{
            explicit: explicitValue !== undefined,
            key,
            type: schema.type,
            options: schema.options,
            value,
        }];
    });
});

function scenePropSchema(contract: SceneTemplatePropContract) {
    if (contract.type === 'struct') return undefined;
    if (contract.type === 'variant') {
        return {
            type: 'enum' as const,
            options: Object.keys(contract.variants),
        };
    }
    return { type: contract.type };
}

function scenePropDefault(contract: SceneTemplatePropContract) {
    if (contract.type === 'struct') return undefined;
    if (contract.default !== undefined) return contract.default;
    if (contract.type === 'number') return 0;
    if (contract.type === 'boolean') return false;
    return '';
}

watch([() => props.selected, () => props.revision, fields], () => {
    for (const key of Object.keys(drafts)) {
        delete drafts[key];
    }
    for (const field of fields.value) {
        drafts[field.key] = field.type === 'color'
            ? `#${Number(field.value).toString(16).padStart(6, '0').slice(-6)}`
            : field.value;
    }
    error.message = '';
}, { immediate: true, flush: 'post' });

function fieldValue(field: InspectorField): InspectorField['value'] {
    const draft = drafts[field.key];
    if (field.type === 'number') return Number(draft);
    if (field.type === 'boolean') return Boolean(draft);
    if (field.type === 'color') return Number.parseInt(String(draft).slice(1), 16);
    if (field.type === 'enum' && field.options?.some((option) => typeof option === 'number')) {
        const numeric = Number(draft);
        return field.options.includes(numeric) ? numeric : String(draft);
    }
    return String(draft);
}

function preview(field: InspectorField) {
    if (!props.document || !props.selected) return;
    props.document.previewNodeProp(props.selected, field.key, fieldValue(field));
}

async function commit(field: InspectorField) {
    if (!props.document || !props.selected) return;
    error.message = '';
    const value = fieldValue(field);
    try {
        const save = props.document.commitNodeProp(props.selected, field.key, value);
        await nextTick();
        drafts[field.key] = value;
        await save;
    } catch (cause) {
        error.message = cause instanceof Error ? cause.message : String(cause);
    }
}

async function reset(field: InspectorField) {
    if (!props.document || !props.selected) return;
    error.message = '';
    try {
        props.document.previewNodeProp(props.selected, field.key, undefined);
        await props.document.commitNodeProp(props.selected, field.key, undefined);
    } catch (cause) {
        error.message = cause instanceof Error ? cause.message : String(cause);
    }
}
</script>

<template>
  <div class="inspector-panel">
    <header class="inspector-heading">
      <div>
        <strong>{{ selectedTitle }}</strong>
        <small>{{ selectedType }}</small>
      </div>
      <span v-if="selectedNode && selectedNode.kind !== 'slotOutlet' && selectedNode.id" class="node-id">#{{ selectedNode.id }}</span>
    </header>

    <div v-if="!selectedNode" class="panel-empty compact">选择一个节点以编辑属性</div>
    <div v-else-if="selectedNode.kind === 'slotOutlet'" class="panel-empty compact">Slot 内容通过层级树编辑</div>
    <div v-else class="inspector-fields">
      <div class="inspector-section-title">属性</div>
      <label v-for="field in fields" :key="field.key" class="property-row">
        <span :class="{ inherited: !field.explicit }">{{ field.key }}</span>
        <div class="property-control">
          <input
            v-if="field.type === 'number'"
            :data-prop="field.key"
            v-model="drafts[field.key]"
            type="number"
            step="any"
            @input="preview(field)"
            @change="commit(field)"
            @blur="commit(field)"
            @keydown.enter="commit(field); ($event.currentTarget as HTMLInputElement).blur()"
          >
          <input
            v-else-if="field.type === 'color'"
            :data-prop="field.key"
            v-model="drafts[field.key]"
            type="color"
            @input="preview(field)"
            @change="commit(field)"
            @blur="commit(field)"
          >
          <input
            v-else-if="field.type === 'boolean'"
            :data-prop="field.key"
            v-model="drafts[field.key]"
            type="checkbox"
            @change="preview(field); commit(field)"
          >
          <select
            v-else-if="field.type === 'enum'"
            :data-prop="field.key"
            v-model="drafts[field.key]"
            @change="preview(field); commit(field)"
          >
            <option v-for="option in field.options" :key="option" :value="option">{{ option }}</option>
          </select>
          <input
            v-else
            :data-prop="field.key"
            v-model="drafts[field.key]"
            type="text"
            @input="preview(field)"
            @change="commit(field)"
            @blur="commit(field)"
            @keydown.enter="commit(field); ($event.currentTarget as HTMLInputElement).blur()"
          >
          <button
            class="reset-button"
            :disabled="!field.explicit"
            type="button"
            :title="`重置 ${field.key}`"
            :aria-label="`重置 ${field.key}`"
            @click="reset(field)"
          >
            <RotateCcw :size="13" />
          </button>
        </div>
      </label>
    </div>
    <p v-if="error.message" class="inline-error">{{ error.message }}</p>
  </div>
</template>
