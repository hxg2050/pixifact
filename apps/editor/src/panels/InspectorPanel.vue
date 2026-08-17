<script setup lang="ts">
import { Link2, RotateCcw, Unlink2 } from 'lucide-vue-next';
import {
    isSceneTemplateBindingValue,
    isPixiSceneNodeType,
    pixiSceneDisplayProps,
    pixiSceneFieldSchema,
    pixiSceneLayoutProps,
    pixiSceneNodeDefaults,
    pixiSceneNodePropKeys,
    pixiSceneTransformProps,
    resolveSceneReference,
    type PixiSceneFieldType,
    type SceneTemplateBindingValue,
    type SceneTemplateInterface,
    type SceneTemplatePropContract,
    type SceneTemplateScalarValue,
} from 'pixifact/compiler';
import { computed, nextTick, reactive, ref, watch } from 'vue';
import type { SceneDocument } from '../document/SceneDocument';
import { findSceneNodeByLocator, type EditorSceneAsset } from '../document/sceneTree';

interface InspectorField {
    binding?: SceneTemplateBindingValue;
    explicit: boolean;
    key: string;
    options?: readonly (string | number)[];
    resource?: 'image';
    type: PixiSceneFieldType;
    value: string | number | boolean;
}

type InspectorSectionKey = 'transform' | 'layout' | 'display' | 'node' | 'props';

interface InspectorFieldRow {
    fields: InspectorField[];
    key: string;
}

interface InspectorFieldSection {
    key: InspectorSectionKey;
    rows: InspectorFieldRow[];
    title: string;
}

const inspectorSections: readonly { key: InspectorSectionKey; title: string }[] = [
    { key: 'transform', title: '变换' },
    { key: 'layout', title: '布局' },
    { key: 'display', title: '显示与交互' },
    { key: 'node', title: '节点属性' },
    { key: 'props', title: 'Scene Props' },
];
const transformFieldKeys = new Set<string>(pixiSceneTransformProps);
const layoutFieldKeys = new Set<string>(pixiSceneLayoutProps);
const displayFieldKeys = new Set<string>(pixiSceneDisplayProps);
const pairedFieldKeys = [
    ['x', 'y'],
    ['width', 'height'],
    ['scaleX', 'scaleY'],
    ['pivotX', 'pivotY'],
    ['skewX', 'skewY'],
    ['left', 'right'],
    ['top', 'bottom'],
    ['horizontal', 'vertical'],
    ['anchorX', 'anchorY'],
] as const;
const pairByFieldKey = new Map<string, readonly [string, string]>();
for (const pair of pairedFieldKeys) {
    pairByFieldKey.set(pair[0], pair);
    pairByFieldKey.set(pair[1], pair);
}

const props = defineProps<{
    document?: SceneDocument;
    draggedAsset?: EditorSceneAsset;
    revision: number;
    sceneInterfaces?: Record<string, SceneTemplateInterface>;
    selected?: string;
}>();
const emit = defineEmits<{
    assetDrop: [];
}>();

const drafts = reactive<Record<string, string | number | boolean>>({});
const nodeIdDraft = ref('');
const nodeIdError = ref('');
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
const ownerInterface = computed(() => (
    props.document ? props.sceneInterfaces?.[props.document.path] : undefined
));

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
    left: '',
    right: '',
    top: '',
    bottom: '',
    horizontal: '',
    vertical: '',
    alpha: 1,
    visible: true,
    zIndex: 0,
    eventMode: 'passive',
    cursor: 'default',
    label: '',
};

const fields = computed<InspectorField[]>(() => {
    void props.revision;
    const node = selectedNode.value;
    if (!node || node.kind === 'slotOutlet') {
        return [];
    }
    const defaults = node.kind === 'pixi' && isPixiSceneNodeType(node.type)
        ? { ...commonDefaults, ...pixiSceneNodeDefaults(node.type) }
        : commonDefaults;
    const keys = node.kind === 'pixi' && isPixiSceneNodeType(node.type)
        ? [...new Set([
            ...pixiSceneTransformProps,
            ...pixiSceneLayoutProps,
            ...pixiSceneDisplayProps,
            ...pixiSceneNodePropKeys(node.type),
        ])]
        : [...new Set([
            ...pixiSceneTransformProps,
            ...pixiSceneLayoutProps,
            ...pixiSceneDisplayProps,
            ...Object.keys(selectedInterface.value?.props ?? {}),
            ...Object.keys(node.props),
        ])];
    return keys.flatMap((key) => {
        const contract = selectedInterface.value?.props[key];
        const pixiSchema = contract ? undefined : pixiSceneFieldSchema(key);
        const schema = contract ? scenePropSchema(contract) : pixiSchema;
        const explicitValue = node.props[key];
        const binding = isSceneTemplateBindingValue(explicitValue) ? explicitValue : undefined;
        const value = binding
            ? resolvedBindingValue(binding, schema?.type, defaults[key])
            : explicitValue ?? (contract ? scenePropDefault(contract) : defaults[key]);
        const displayValue = value ?? (pixiSchema?.resource === 'image' ? '' : undefined);
        if (!schema || displayValue === undefined || typeof displayValue === 'object') {
            return [];
        }
        return [{
            binding,
            explicit: explicitValue !== undefined,
            key,
            resource: pixiSchema?.resource,
            type: schema.type,
            options: schema.options,
            value: displayValue,
        }];
    });
});

const fieldSections = computed<InspectorFieldSection[]>(() => {
    const node = selectedNode.value;
    if (!node || node.kind === 'slotOutlet') return [];

    const grouped: Record<InspectorSectionKey, InspectorField[]> = {
        transform: [],
        layout: [],
        display: [],
        node: [],
        props: [],
    };
    for (const field of fields.value) {
        let section: InspectorSectionKey;
        if (node.kind === 'sceneInstance' && selectedInterface.value?.props[field.key]) {
            section = 'props';
        } else if (transformFieldKeys.has(field.key)) {
            section = 'transform';
        } else if (layoutFieldKeys.has(field.key)) {
            section = 'layout';
        } else if (displayFieldKeys.has(field.key)) {
            section = 'display';
        } else {
            section = node.kind === 'sceneInstance' ? 'props' : 'node';
        }
        grouped[section].push(field);
    }

    return inspectorSections.flatMap(({ key, title }) => {
        const rows = groupFieldRows(grouped[key]);
        return rows.length > 0 ? [{ key, title, rows }] : [];
    });
});

function groupFieldRows(sectionFields: InspectorField[]): InspectorFieldRow[] {
    const fieldsByKey = new Map(sectionFields.map((field) => [field.key, field]));
    const consumed = new Set<string>();
    const rows: InspectorFieldRow[] = [];

    for (const field of sectionFields) {
        if (consumed.has(field.key)) continue;
        const pair = pairByFieldKey.get(field.key);
        const first = pair ? fieldsByKey.get(pair[0]) : undefined;
        const second = pair ? fieldsByKey.get(pair[1]) : undefined;
        if (pair && first && second) {
            rows.push({ key: `${pair[0]}:${pair[1]}`, fields: [first, second] });
            consumed.add(pair[0]);
            consumed.add(pair[1]);
            continue;
        }
        rows.push({ key: field.key, fields: [field] });
        consumed.add(field.key);
    }

    return rows;
}

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

function resolvedBindingValue(
    binding: SceneTemplateBindingValue,
    targetType: PixiSceneFieldType | undefined,
    targetDefault: unknown,
): SceneTemplateScalarValue | undefined {
    const [prop, field] = binding.path;
    const contract = ownerInterface.value?.props[prop];
    let value: SceneTemplateScalarValue | undefined;
    if (field && contract?.type === 'variant') {
        value = contract.variants[contract.default]?.[field];
    } else if (!field && contract && contract.type !== 'struct') {
        value = scenePropDefault(contract);
    }
    if (value === undefined && ['string', 'number', 'boolean'].includes(typeof targetDefault)) {
        value = targetDefault as SceneTemplateScalarValue;
    }
    if (targetType === 'color' && typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)) {
        return Number.parseInt(value.slice(1), 16);
    }
    if (targetType === 'string') {
        return String(value ?? '');
    }
    return value;
}

watch([() => props.selected, () => props.revision, fields], () => {
    for (const key of Object.keys(drafts)) {
        delete drafts[key];
    }
    for (const field of fields.value) {
        drafts[field.key] = fieldDraftValue(field, field.value);
    }
    const node = selectedNode.value;
    nodeIdDraft.value = node && node.kind !== 'slotOutlet' ? node.id ?? '' : '';
    nodeIdError.value = '';
    error.message = '';
}, { immediate: true, flush: 'post' });

function fieldDraftValue(field: InspectorField, value: InspectorField['value']) {
    return field.type === 'color'
        ? `#${Number(value).toString(16).padStart(6, '0').slice(-6)}`
        : value;
}

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
    if (!props.document || !props.selected || field.resource) return;
    props.document.previewNodeProp(props.selected, field.key, fieldValue(field));
}

async function commitNodeId() {
    const node = selectedNode.value;
    const locator = props.selected;
    if (!props.document || !locator || !node || node.kind === 'slotOutlet') return;
    const value = nodeIdDraft.value.trim();
    nodeIdError.value = '';
    if (value === (node.id ?? '')) {
        nodeIdDraft.value = value;
        return;
    }
    error.message = '';
    if (!value) {
        nodeIdDraft.value = node.id ?? '';
        nodeIdError.value = '节点 ID 不能为空。';
        return;
    }
    try {
        await props.document.commitNodeId(locator, value);
    } catch (cause) {
        nodeIdDraft.value = node.id ?? '';
        nodeIdError.value = cause instanceof Error ? cause.message : String(cause);
    }
}

function clearNodeIdError() {
    nodeIdError.value = '';
}

async function commitNodeIdAndBlur(input: HTMLInputElement) {
    await commitNodeId();
    input.blur();
}

async function commit(field: InspectorField) {
    if (!props.document || !props.selected) return;
    error.message = '';
    const value = fieldValue(field);
    try {
        const save = props.document.commitNodeProp(props.selected, field.key, value);
        await nextTick();
        drafts[field.key] = fieldDraftValue(field, value);
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

async function unbind(field: InspectorField) {
    if (!props.document || !props.selected || !field.binding) return;
    error.message = '';
    try {
        await props.document.commitNodeProp(props.selected, field.key, field.value);
    } catch (cause) {
        error.message = cause instanceof Error ? cause.message : String(cause);
    }
}

function canDropImage(field: InspectorField) {
    return field.resource === 'image'
        && !field.binding
        && props.draggedAsset?.kind === 'image';
}

async function dropAsset(field: InspectorField) {
    const asset = props.draggedAsset;
    if (!props.document || !props.selected || !asset || asset.kind !== 'image' || !canDropImage(field)) return;
    emit('assetDrop');
    error.message = '';
    try {
        const save = props.document.commitNodeProp(props.selected, field.key, asset.path);
        await nextTick();
        drafts[field.key] = asset.path;
        await save;
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
    </header>

    <div v-if="!selectedNode" class="panel-empty compact">选择一个节点以编辑属性</div>
    <div v-else-if="selectedNode.kind === 'slotOutlet'" class="panel-empty compact">Slot 内容通过层级树编辑</div>
    <div v-else class="inspector-fields">
      <section class="inspector-section" data-inspector-section="identity">
        <div class="inspector-section-title">节点</div>
        <div class="property-row">
          <label class="property-field">
            <span>id</span>
            <div class="property-control node-id-control">
              <div class="property-value">
                <input
                  v-model="nodeIdDraft"
                  aria-label="节点 ID"
                  data-node-id
                  :aria-invalid="nodeIdError ? 'true' : undefined"
                  :class="{ 'is-invalid': !!nodeIdError }"
                  type="text"
                  autocomplete="off"
                  spellcheck="false"
                  @input="clearNodeIdError"
                  @blur="commitNodeId"
                  @keydown.enter.prevent="commitNodeIdAndBlur($event.currentTarget as HTMLInputElement)"
                >
              </div>
            </div>
          </label>
        </div>
      </section>
      <section
        v-for="section in fieldSections"
        :key="section.key"
        class="inspector-section"
        :data-inspector-section="section.key"
      >
        <div class="inspector-section-title">{{ section.title }}</div>
        <div
          v-for="row in section.rows"
          :key="row.key"
          class="property-row"
          :class="{ 'is-paired': row.fields.length === 2 }"
          :data-field-row="row.key"
        >
          <label
            v-for="field in row.fields"
            :key="field.key"
            class="property-field"
            :class="{ 'is-image-drop-candidate': canDropImage(field) }"
            :data-asset-drop-prop="field.resource === 'image' ? field.key : undefined"
            @pointerup="dropAsset(field)"
          >
            <span :class="{ inherited: !field.explicit }">{{ field.key }}</span>
            <div class="property-control">
              <div class="property-value">
                <input
                  v-if="field.type === 'number'"
                  :data-prop="field.key"
                  v-model="drafts[field.key]"
                  :disabled="!!field.binding"
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
                  :disabled="!!field.binding"
                  type="color"
                  @input="preview(field)"
                  @change="commit(field)"
                  @blur="commit(field)"
                >
                <input
                  v-else-if="field.type === 'boolean'"
                  :data-prop="field.key"
                  v-model="drafts[field.key]"
                  :disabled="!!field.binding"
                  type="checkbox"
                  @change="preview(field); commit(field)"
                >
                <select
                  v-else-if="field.type === 'enum'"
                  :data-prop="field.key"
                  v-model="drafts[field.key]"
                  :disabled="!!field.binding"
                  @change="preview(field); commit(field)"
                >
                  <option v-for="option in field.options" :key="option" :value="option">{{ option }}</option>
                </select>
                <input
                  v-else
                  :data-prop="field.key"
                  v-model="drafts[field.key]"
                  :disabled="!!field.binding"
                  type="text"
                  @input="preview(field)"
                  @change="commit(field)"
                  @blur="commit(field)"
                  @keydown.enter="commit(field); ($event.currentTarget as HTMLInputElement).blur()"
                >
                <span
                  v-if="field.binding"
                  class="binding-source"
                  :data-binding-source="field.key"
                >
                  <Link2 :size="11" />绑定：{{ field.binding.path.join('.') }}
                </span>
              </div>
              <button
                v-if="field.binding"
                class="reset-button"
                type="button"
                :data-unbind-prop="field.key"
                :title="`解除 ${field.key} 的绑定`"
                :aria-label="`解除 ${field.key} 的绑定`"
                @click="unbind(field)"
              >
                <Unlink2 :size="13" />
              </button>
              <button
                v-else
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
      </section>
    </div>
    <p v-if="nodeIdError || error.message" class="inline-error">{{ nodeIdError || error.message }}</p>
  </div>
</template>
