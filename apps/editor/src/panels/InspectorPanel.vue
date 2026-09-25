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
    sceneNativeEventNames,
    type PixiSceneFieldType,
    type CompilerSceneCommand,
    type SceneTemplateBindingValue,
    type SceneTemplateInterface,
    type SceneTemplatePropContract,
    type SceneTemplateScalarValue,
    type SceneTemplateValue,
} from 'pixifact/compiler';
import { computed, nextTick, reactive, ref, watch } from 'vue';
import type { SceneDocument } from '../document/SceneDocument';
import { findSceneNodeByLocator, type EditorSceneAsset } from '../document/sceneTree';

interface InspectorField {
    binding?: SceneTemplateBindingValue;
    explicit: boolean;
    key: string;
    label?: string;
    layoutControlled: boolean;
    mixed?: boolean;
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
    { key: 'node', title: '节点属性' },
    { key: 'props', title: 'Scene Props' },
    { key: 'display', title: '显示与交互' },
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

function isLayoutControlled(props: Record<string, SceneTemplateValue>, key: string) {
    if (key === 'x') return props.left !== undefined || props.right !== undefined || props.horizontal !== undefined;
    if (key === 'width') return props.left !== undefined && props.right !== undefined;
    if (key === 'y') return props.top !== undefined || props.bottom !== undefined || props.vertical !== undefined;
    if (key === 'height') return props.top !== undefined && props.bottom !== undefined;
    return false;
}

const props = defineProps<{
    document?: SceneDocument;
    draggedAsset?: EditorSceneAsset;
    revision: number;
    sceneDefaults?: Record<string, Record<string, SceneTemplateValue>>;
    sceneInterfaces?: Record<string, SceneTemplateInterface>;
    selected?: string;
    selections: string[];
}>();
const emit = defineEmits<{
    assetDrop: [];
    locateAsset: [path: string];
}>();

const drafts = reactive<Record<string, string | number | boolean>>({});
const changedFields = new Set<string>();
const nodeIdDraft = ref('');
const nodeIdError = ref('');
const error = reactive({ message: '' });
const eventDrafts = reactive<Record<string, string>>({});
const isRoot = computed(() => !!props.document && !props.selected && props.selections.length === 0);
const selectedNode = computed(() => {
    void props.revision;
    return props.document && props.selected
        ? findSceneNodeByLocator(props.document.template.children, props.selected)
        : undefined;
});
const selectedNodes = computed(() => {
    void props.revision;
    return props.document
        ? props.selections.flatMap((locator) => {
            const node = findSceneNodeByLocator(props.document!.template.children, locator);
            return node ? [{ locator, node }] : [];
        })
        : [];
});
const isMulti = computed(() => selectedNodes.value.length > 1);
const selectedTitle = computed(() => {
    if (!props.document) return '未打开 Scene';
    if (isMulti.value) return `${selectedNodes.value.length} 个节点`;
    if (!selectedNode.value) return props.document.template.name;
    const node = selectedNode.value;
    if (node.kind === 'slotOutlet') return `Slot · ${node.name}`;
    return node.id || (node.kind === 'sceneInstance' ? node.type : node.type);
});
const selectedType = computed(() => {
    if (isMulti.value) return '多选';
    const node = selectedNode.value;
    if (!node) return 'Scene · Group';
    if (node.kind === 'slotOutlet') return 'Slot';
    return node.kind === 'sceneInstance' ? `Scene · ${node.type}` : node.type;
});
const layoutControlNote = computed(() => {
    const node = selectedNode.value;
    if (!node || node.kind === 'slotOutlet' || isMulti.value) return '';
    const values = node.props;
    const horizontal = ['left', 'right', 'horizontal'].filter((key) => values[key] !== undefined);
    const vertical = ['top', 'bottom', 'vertical'].filter((key) => values[key] !== undefined);
    const notes = [];
    if (horizontal.length) notes.push(`X${values.left !== undefined && values.right !== undefined ? '、宽度' : ''} 由 ${horizontal.join(' / ')} 控制`);
    if (vertical.length) notes.push(`Y${values.top !== undefined && values.bottom !== undefined ? '、高度' : ''} 由 ${vertical.join(' / ')} 控制`);
    return notes.join('；');
});
const selectedChildScenePath = computed(() => {
    const node = selectedNode.value;
    return props.document && node?.kind === 'sceneInstance'
        ? resolveSceneReference(props.document.path, node.scene)
        : undefined;
});
const selectedInterface = computed(() => selectedChildScenePath.value
    ? props.sceneInterfaces?.[selectedChildScenePath.value]
    : undefined);
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

function fieldsForNode(
    node: ReturnType<typeof findSceneNodeByLocator>,
    sceneInterface?: SceneTemplateInterface,
    root = false,
    sceneDefaults: Record<string, SceneTemplateValue> = {},
): InspectorField[] {
    if (!node || node.kind === 'slotOutlet') {
        return [];
    }
    const defaults: Record<string, string | number | boolean> = node.kind === 'pixi' && isPixiSceneNodeType(node.type)
        ? { ...commonDefaults, ...pixiSceneNodeDefaults(node.type), ...(root ? { width: 960, height: 540 } : {}) }
        : { ...commonDefaults };
    if (Object.keys(node.events ?? {}).length > 0 && node.props.eventMode === undefined) defaults.eventMode = 'static';
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
            ...Object.keys(sceneInterface?.props ?? {}),
            ...Object.keys(node.props),
        ])];
    return keys.flatMap((key) => {
        const contract = sceneInterface?.props[key];
        const pixiSchema = contract ? undefined : pixiSceneFieldSchema(key);
        const schema = contract ? scenePropSchema(contract) : pixiSchema;
        const explicitValue = node.props[key];
        const binding = isSceneTemplateBindingValue(explicitValue) ? explicitValue : undefined;
        const value = binding
            ? resolvedBindingValue(binding, schema?.type, defaults[key])
            : explicitValue ?? (contract ? sceneDefaults[key] ?? scenePropDefault(contract) : defaults[key]);
        const displayValue = value ?? (pixiSchema?.resource === 'image' ? '' : undefined);
        if (!schema || displayValue === undefined || typeof displayValue === 'object') {
            return [];
        }
        return [{
            binding,
            explicit: explicitValue !== undefined,
            key,
            layoutControlled: isLayoutControlled(node.props, key),
            resource: pixiSchema?.resource,
            type: schema.type,
            options: schema.options,
            value: displayValue,
        }];
    });
}

const rootNode = computed(() => props.document ? ({
    kind: 'pixi' as const,
    type: 'Group' as const,
    props: props.document.template.props,
    events: props.document.template.events ?? {},
    children: [],
}) : undefined);

function rootDefaultFields(): InspectorField[] {
    const template = props.document?.template;
    if (!template) return [];
    return Object.entries(ownerInterface.value?.props ?? {}).flatMap<InspectorField>(([name, contract]) => {
        const explicit = template.propDefaults?.[name];
        if (contract.type === 'struct') {
            return Object.entries(contract.fields).map(([field, schema]) => {
                const value = explicit && typeof explicit === 'object' && !isSceneTemplateBindingValue(explicit)
                    ? explicit[field] : undefined;
                return {
                    explicit: value !== undefined,
                    key: `default.${name}.${field}`,
                    label: `${name}.${field}`,
                    layoutControlled: false,
                    type: schema.type,
                    value: value ?? schema.default,
                };
            });
        }
        const schema = scenePropSchema(contract)!;
        const fallback = scenePropDefault(contract);
        if (fallback === undefined) return [];
        return [{
            explicit: explicit !== undefined,
            key: `default.${name}`,
            label: name,
            layoutControlled: false,
            type: schema.type,
            options: schema.options,
            value: explicit !== undefined && typeof explicit !== 'object' ? explicit : fallback,
        }];
    });
}

const fields = computed<InspectorField[]>(() => {
    void props.revision;
    if (isRoot.value) return [...fieldsForNode(rootNode.value, undefined, true), ...rootDefaultFields()];
    const node = selectedNode.value;
    if (!node) return [];
    const first = fieldsForNode(node, selectedInterface.value, false,
        selectedChildScenePath.value ? props.sceneDefaults?.[selectedChildScenePath.value] : undefined);
    if (!isMulti.value) return first;
    const others = selectedNodes.value
        .filter(({ locator }) => locator !== props.selected)
        .map(({ node: other }) => new Map(fieldsForNode(other,
            other.kind === 'sceneInstance' && props.document
                ? props.sceneInterfaces?.[resolveSceneReference(props.document.path, other.scene)]
                : undefined,
            false,
            other.kind === 'sceneInstance' && props.document
                ? props.sceneDefaults?.[resolveSceneReference(props.document.path, other.scene)]
                : undefined,
        ).map((field) => [field.key, field])));
    return first.flatMap((field) => {
        if (field.binding || field.layoutControlled) return [];
        const matches = others.map((other) => other.get(field.key));
        if (matches.some((match) => !match
            || match.type !== field.type
            || match.resource !== field.resource
            || match.binding
            || match.layoutControlled
            || JSON.stringify(match.options) !== JSON.stringify(field.options))) return [];
        return [{
            ...field,
            explicit: field.explicit || matches.some((match) => match!.explicit),
            mixed: matches.some((match) => match!.value !== field.value),
        }];
    });
});

const fieldSections = computed<InspectorFieldSection[]>(() => {
    const node = selectedNode.value ?? (isRoot.value ? rootNode.value : undefined);
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
        if (field.key.startsWith('default.') || (node.kind === 'sceneInstance' && selectedInterface.value?.props[field.key])) {
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

const eventNames = computed(() => {
    if (isRoot.value || selectedNode.value?.kind === 'pixi') return [...sceneNativeEventNames];
    if (selectedNode.value?.kind === 'sceneInstance') return Object.keys(selectedInterface.value?.events ?? {});
    return [];
});

const selectedEvents = computed(() => isRoot.value
    ? props.document?.template.events ?? {}
    : selectedNode.value?.kind === 'slotOutlet' ? {} : selectedNode.value?.events ?? {});

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
    const editorDefault = props.document?.template.propDefaults?.[prop];
    let value: SceneTemplateScalarValue | undefined;
    if (field && contract?.type === 'variant') {
        value = contract.variants[typeof editorDefault === 'string' ? editorDefault : contract.default]?.[field];
    } else if (!field && contract && contract.type !== 'struct') {
        value = editorDefault !== undefined && typeof editorDefault !== 'object' ? editorDefault : scenePropDefault(contract);
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
    changedFields.clear();
    for (const field of fields.value) {
        drafts[field.key] = field.mixed ? '' : fieldDraftValue(field, field.value);
    }
    const node = selectedNode.value;
    nodeIdDraft.value = node && node.kind !== 'slotOutlet' ? node.id ?? '' : '';
    nodeIdError.value = '';
    error.message = '';
    for (const key of Object.keys(eventDrafts)) delete eventDrafts[key];
    for (const name of eventNames.value) eventDrafts[name] = selectedEvents.value[name] ?? '';
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
    changedFields.add(field.key);
    if (!props.document || field.resource || field.layoutControlled || (field.type === 'number' && drafts[field.key] === '')) return;
    if (field.type === 'color' && !Number.isFinite(fieldValue(field))) return;
    for (const { locator } of selectedNodes.value) {
        props.document.previewNodeProp(locator, field.key, fieldValue(field));
    }
}

function locateAsset(field: InspectorField) {
    if (field.resource !== 'image' || typeof field.value !== 'string' || !field.value) return;
    emit('locateAsset', field.value);
}

async function commitNodeId() {
    const node = selectedNode.value;
    const locator = props.selected;
    if (!props.document || !locator || !node || node.kind === 'slotOutlet' || isMulti.value) return;
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
    if (!props.document || (!isRoot.value && selectedNodes.value.length === 0) || field.layoutControlled) return;
    if (isMulti.value && !changedFields.has(field.key)) return;
    error.message = '';
    const value = fieldValue(field);
    if (field.type === 'number' && (drafts[field.key] === '' || !Number.isFinite(value))) return;
    if (field.type === 'color' && !Number.isFinite(value)) return;
    try {
        const save = commitSelectedProp(field.key, value);
        await nextTick();
        drafts[field.key] = fieldDraftValue(field, value);
        await save;
        changedFields.delete(field.key);
    } catch (cause) {
        error.message = cause instanceof Error ? cause.message : String(cause);
    }
}

async function reset(field: InspectorField) {
    if (!props.document || (!isRoot.value && selectedNodes.value.length === 0)) return;
    error.message = '';
    try {
        for (const { locator } of selectedNodes.value) props.document.previewNodeProp(locator, field.key, undefined);
        await commitSelectedProp(field.key, undefined);
    } catch (cause) {
        error.message = cause instanceof Error ? cause.message : String(cause);
    }
}

function commitSelectedProp(key: string, value?: SceneTemplateValue) {
    const document = props.document!;
    if (isRoot.value) return document.commitCommand(key.startsWith('default.')
        ? { op: 'setSceneDefaultProp', prop: key.slice('default.'.length), value }
        : { op: 'setSceneProp', prop: key, value });
    if (!isMulti.value) return document.commitNodeProp(props.selected!, key, value);
    const commands: CompilerSceneCommand[] = selectedNodes.value.flatMap(({ locator, node }) => (
        node.kind !== 'slotOutlet' && node.props[key] !== value
            ? [{ op: 'setNodeProp', node: locator, prop: key, value }]
            : []
    ));
    if (commands.length === 0) return Promise.resolve();
    return document.commitCommand({ op: 'batch', commands });
}

async function commitEvent(name: string) {
    if (!props.document || (!isRoot.value && (!props.selected || isMulti.value))) return;
    const value = eventDrafts[name]?.trim() || undefined;
    if (value === selectedEvents.value[name]) return;
    error.message = '';
    try {
        await props.document.commitCommand(isRoot.value
            ? { op: 'setSceneEvent', event: name, value }
            : { op: 'setNodeEvent', node: props.selected!, event: name, value });
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
    if (!props.document || selectedNodes.value.length === 0 || !asset || asset.kind !== 'image' || !canDropImage(field)) return;
    emit('assetDrop');
    error.message = '';
    try {
        const save = commitSelectedProp(field.key, asset.path);
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
        <small>{{ selectedType }}<template v-if="selected && !isMulti"> · {{ selected }}</template></small>
      </div>
    </header>

    <div v-if="!selectedNode && !isRoot" class="panel-empty compact">选择一个节点以编辑属性</div>
    <div v-else-if="isMulti && fields.length === 0" class="panel-empty compact">所选节点没有共有的可编辑属性</div>
    <div v-else-if="selectedNode?.kind === 'slotOutlet'" class="panel-empty compact">Slot 内容通过层级树编辑</div>
    <div v-else class="inspector-fields">
      <section v-if="isRoot" class="inspector-section" data-inspector-section="identity">
        <div class="inspector-section-title">Scene</div>
        <div class="property-row"><span class="property-field"><span>路径</span><span>{{ document?.path }}</span></span></div>
      </section>
      <section v-else-if="!isMulti" class="inspector-section" data-inspector-section="identity">
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
      <details
        v-for="section in fieldSections"
        :key="section.key"
        class="inspector-section"
        :data-inspector-section="section.key"
        :open="section.key !== 'display'"
      >
        <summary class="inspector-section-title">{{ section.title }}</summary>
        <div v-if="section.key === 'transform' && layoutControlNote" class="layout-control-note">
          <strong>布局已接管</strong>
          <span>{{ layoutControlNote }}。请在「布局」中调整对应约束。</span>
        </div>
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
            <span
              :class="{ inherited: !field.explicit }"
              :title="field.layoutControlled ? '由布局属性控制，请修改布局字段' : undefined"
            >{{ field.label ?? field.key }}</span>
            <div class="property-control">
              <div class="property-value">
                <input
                  v-if="field.type === 'number'"
                  :data-prop="field.key"
                  v-model="drafts[field.key]"
                  :disabled="!!field.binding || field.layoutControlled"
                  :title="field.layoutControlled ? '由布局属性控制，请修改布局字段' : undefined"
                  :placeholder="field.mixed ? '混合值' : undefined"
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
                  :disabled="!!field.binding || field.layoutControlled"
                  :type="field.mixed ? 'text' : 'color'"
                  :placeholder="field.mixed ? '混合值（#RRGGBB）' : undefined"
                  @input="preview(field)"
                  @change="commit(field)"
                  @blur="commit(field)"
                >
                <input
                  v-else-if="field.type === 'boolean'"
                  :data-prop="field.key"
                  v-model="drafts[field.key]"
                  :disabled="!!field.binding || field.layoutControlled"
                  type="checkbox"
                  :indeterminate="field.mixed && !changedFields.has(field.key)"
                  @change="preview(field); commit(field)"
                >
                <select
                  v-else-if="field.type === 'enum'"
                  :data-prop="field.key"
                  v-model="drafts[field.key]"
                  :disabled="!!field.binding || field.layoutControlled"
                  @change="preview(field); commit(field)"
                >
                  <option v-if="field.mixed && !changedFields.has(field.key)" value="" disabled>混合值</option>
                  <option v-for="option in field.options" :key="option" :value="option">{{ option }}</option>
                </select>
                <input
                  v-else
                  :data-prop="field.key"
                  v-model="drafts[field.key]"
                  :disabled="!!field.binding || field.layoutControlled"
                  :class="{ 'resource-reference': field.resource === 'image' && typeof field.value === 'string' && !!field.value }"
                  :title="field.resource === 'image' && typeof field.value === 'string' && field.value ? '点击定位素材' : undefined"
                  :placeholder="field.mixed ? '混合值' : undefined"
                  type="text"
                  @click="locateAsset(field)"
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
                :disabled="!field.explicit || field.layoutControlled"
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
      </details>
      <details v-if="eventNames.length && !isMulti" class="inspector-section" data-inspector-section="events">
        <summary class="inspector-section-title">{{ selectedNode?.kind === 'sceneInstance' ? '对外事件' : '节点事件' }}</summary>
        <div v-for="name in eventNames" :key="name" class="property-row" :data-event-row="name">
          <label class="property-field">
            <span :class="{ inherited: !selectedEvents[name] }">{{ name }}</span>
            <div class="property-control">
              <div class="property-value">
                <input
                  v-model="eventDrafts[name]"
                  :aria-label="`${name} Action`"
                  :data-event="name"
                  type="text"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="Action 名称"
                  @change="commitEvent(name)"
                  @blur="commitEvent(name)"
                  @keydown.enter="commitEvent(name); ($event.currentTarget as HTMLInputElement).blur()"
                >
              </div>
              <button type="button" class="reset-button" :disabled="!selectedEvents[name]" :title="`清除 ${name} 绑定`" :aria-label="`清除 ${name} 绑定`" @click="eventDrafts[name] = ''; commitEvent(name)">
                <RotateCcw :size="13" />
              </button>
            </div>
          </label>
        </div>
      </details>
    </div>
    <p v-if="nodeIdError || error.message" class="inline-error">{{ nodeIdError || error.message }}</p>
  </div>
</template>
