import { useEffect, useRef, useState } from 'react';
import {
    compilerSceneNodeLocator,
    getCompilerSceneDocument,
    updateCompilerSceneTemplate,
    updateCompilerSceneNode,
} from '../document/compilerSceneDocumentController';
import {
    isPixiSceneNodeType,
    pixiSceneDisplayProps,
    pixiSceneFieldSchema,
    pixiSceneKnownProps,
    pixiSceneLayoutProps,
    pixiSceneNodeDefaults,
    pixiSceneNodePropGroups,
    pixiSceneNodePropKeys,
    type PixiSceneFieldSchema,
    type PixiScenePropGroup,
    pixiSceneTransformProps,
    pairedSceneScriptPath,
    resolveSceneReference,
} from 'pixifact/compiler';
import {
    Checkbox,
    DropZone,
    Select,
    TextField,
} from '../components/system';
import { useI18n } from '../i18n';
import type { I18nKey } from '../i18n';
import type {
    CompilerSceneScriptInterface,
    CompilerSceneTemplateInterface,
    CompilerSceneTemplateNode,
    ProjectFileTreeNode,
} from '../services/projectFileTree';
import {
    findFileByPath,
    openCompilerSceneScriptFile,
    assetDragDataType,
    projectFileRelativePath,
    resolveProjectAssetReference,
} from '../services/projectFileTree';
import { readCompilerSceneBinding } from '../services/sceneBindingIndex';
import { hostErrorMessage } from '../services/hostBridge';
import { FieldRow, parseTextValue, useCompilerSceneRevision } from './common';
import { useEditorStore } from '../editorStore';
import { measureSceneViewProfileAsync } from '../services/sceneViewProfiler';

const fieldLabelKeys: Record<string, I18nKey> = {
    width: 'width',
    height: 'height',
    left: 'left',
    right: 'right',
    top: 'top',
    bottom: 'bottom',
    horizontal: 'horizontal',
    vertical: 'vertical',
    direction: 'direction',
    scrollX: 'scrollX',
    scrollY: 'scrollY',
    fit: 'fit',
    mode: 'mode',
    src: 'src',
    tint: 'tint',
    texture: 'texture',
    pivotX: 'pivotX',
    pivotY: 'pivotY',
    skewX: 'skewX',
    skewY: 'skewY',
    eventMode: 'eventMode',
    cursor: 'cursor',
    label: 'label',
    shape: 'shape',
    tilePositionX: 'tilePositionX',
    tilePositionY: 'tilePositionY',
    tileScaleX: 'tileScaleX',
    tileScaleY: 'tileScaleY',
    tileRotation: 'tileRotation',
    leftWidth: 'leftWidth',
    rightWidth: 'rightWidth',
    topHeight: 'topHeight',
    bottomHeight: 'bottomHeight',
    type: 'type',
    anchorX: 'anchorX',
    anchorY: 'anchorY',
    scaleX: 'scaleX',
    scaleY: 'scaleY',
    rotation: 'rotation',
    raycastTarget: 'raycastTarget',
    color: 'color',
    fillColor: 'fillColor',
    fillAlpha: 'fillAlpha',
    radius: 'radius',
    strokeColor: 'strokeColor',
    strokeWidth: 'strokeWidth',
    strokeAlpha: 'strokeAlpha',
    text: 'text',
    fontSize: 'fontSize',
    fontFamily: 'fontFamily',
    fontWeight: 'fontWeight',
    center: 'center',
    onClick: 'onClick',
    interactable: 'interactable',
    targetGraphic: 'targetGraphic',
    transition: 'transition',
    normalColor: 'normalColor',
    highlightedColor: 'highlightedColor',
    pressedColor: 'pressedColor',
    disabledColor: 'disabledColor',
    pressedScale: 'pressedScale',
    value: 'value',
    min: 'min',
    max: 'max',
    fillNode: 'fillNode',
    fillGraphic: 'fillGraphic',
    placeholder: 'placeholder',
    multiline: 'multiline',
    textGraphic: 'textGraphic',
    backgroundColor: 'backgroundColor',
    borderColor: 'borderColor',
    borderSize: 'borderSize',
    textColor: 'textColor',
    paddingLeft: 'paddingLeft',
    paddingRight: 'paddingRight',
    paddingTop: 'paddingTop',
    paddingBottom: 'paddingBottom',
    viewport: 'viewport',
    content: 'content',
    contentHeight: 'contentHeight',
    wheelSensitivity: 'wheelSensitivity',
    dragEnabled: 'dragEnabled',
};

type Translate = (key: I18nKey, values?: Record<string, string | number>) => string;

interface InspectorFieldModel {
    key: string;
    label: string;
    schema?: PixiSceneFieldSchema;
    type: string;
    value: unknown;
}

interface SelectedCompilerSlot {
    kind: 'slot';
    owner: string;
    name: string;
    childCount: number;
}

type SelectedCompilerItem = CompilerSceneTemplateNode | SelectedCompilerSlot | undefined;
type EditableCompilerNode = Extract<CompilerSceneTemplateNode, { kind: 'pixi' | 'sceneInstance' }>;
type CompilerLayoutAxis = 'horizontal' | 'vertical';
type CompilerHorizontalAlignment = 'none' | 'left' | 'center' | 'right' | 'stretch';
type CompilerVerticalAlignment = 'none' | 'top' | 'middle' | 'bottom' | 'stretch';
type CompilerLayoutAlignment = CompilerHorizontalAlignment | CompilerVerticalAlignment;

const compilerKnownPixiProps = new Set<string>(pixiSceneKnownProps);
const compilerPixiGroupTitles: Record<PixiScenePropGroup, string> = {
    transform: 'Transform',
    display: 'Display',
    stack: 'Stack',
    sprite: 'Sprite',
    nineSlice: 'Nine Slice',
    tiling: 'Tiling',
    text: 'Text',
    graphics: 'Graphics',
    props: 'Props',
};

function compilerSlotChildCount(nodes: readonly CompilerSceneTemplateNode[], locator: string, path = ''): number {
    for (const [index, node] of nodes.entries()) {
        const nodePath = path ? `${path}/${index}` : String(index);
        const nodeLocator = compilerSceneNodeLocator(node, nodePath);
        if (node.kind === 'pixi') {
            const count = compilerSlotChildCount(node.children, locator, nodeLocator);
            if (count >= 0) {
                return count;
            }
            continue;
        }
        if (node.kind === 'sceneInstance') {
            for (const [slot, children] of Object.entries(node.slots)) {
                const slotLocator = `${nodeLocator}/slot:${slot}`;
                if (slotLocator === locator) {
                    return children.length;
                }
                const count = compilerSlotChildCount(children, locator, slotLocator);
                if (count >= 0) {
                    return count;
                }
            }
        }
    }
    return -1;
}

function selectedCompilerNode(nodes: readonly CompilerSceneTemplateNode[], locator: string, path = ''): CompilerSceneTemplateNode | undefined {
    for (const [index, node] of nodes.entries()) {
        const nodePath = path ? `${path}/${index}` : String(index);
        const nodeLocator = compilerSceneNodeLocator(node, nodePath);
        if (nodeLocator === locator) {
            return node;
        }
        if (node.kind === 'pixi') {
            const child = selectedCompilerNode(node.children, locator, nodeLocator);
            if (child) {
                return child;
            }
        }
        if (node.kind === 'sceneInstance') {
            for (const [slot, children] of Object.entries(node.slots)) {
                const child = selectedCompilerNode(children, locator, `${nodeLocator}/slot:${slot}`);
                if (child) {
                    return child;
                }
            }
        }
    }
    return undefined;
}

function compilerParentNode(nodes: readonly CompilerSceneTemplateNode[], locator: string) {
    const parentLocator = locator.includes('/') ? locator.split('/').slice(0, -1).join('/') : undefined;
    return parentLocator ? selectedCompilerNode(nodes, parentLocator) : undefined;
}

function selectedCompilerSlot(nodes: readonly CompilerSceneTemplateNode[], locator: string): SelectedCompilerSlot | undefined {
    const segment = locator.split('/').at(-1);
    return segment?.startsWith('slot:')
        ? {
            kind: 'slot',
            owner: locator.slice(0, -segment.length - 1),
            name: segment.slice('slot:'.length),
            childCount: Math.max(0, compilerSlotChildCount(nodes, locator)),
        }
        : undefined;
}

function compilerNodeKind(node: SelectedCompilerItem, t: Translate) {
    if (!node) {
        return t('compilerSceneSection');
    }
    if (node.kind === 'slot') {
        return t('compilerSlotPlacementLabel');
    }
    if (node.kind === 'slotOutlet') {
        return t('compilerSlotOutletLabel');
    }
    if (node.kind === 'sceneInstance') {
        return t('compilerSceneInstanceKind');
    }
    return node.type;
}

function compilerNodeName(node: SelectedCompilerItem, sceneName: string, t: Translate) {
    if (!node) {
        return sceneName;
    }
    if (node.kind === 'slot') {
        return t('compilerSlotLabel', { name: node.name });
    }
    if (node.kind === 'slotOutlet') {
        return node.name;
    }
    return node.id ?? compilerNodeKind(node, t);
}

function contractCount(contract: CompilerSceneScriptInterface['interface'] | undefined, key: keyof CompilerSceneScriptInterface['interface']) {
    return Object.keys(contract?.[key] ?? {}).length;
}

function contractNames(contract: CompilerSceneScriptInterface['interface'] | undefined, key: keyof CompilerSceneScriptInterface['interface'], t: Translate) {
    const names = Object.keys(contract?.[key] ?? {});
    return names.length ? names.join(', ') : t('compilerNoContractItems');
}

function partNames(descriptor: CompilerSceneScriptInterface | undefined, t: Translate) {
    const names = Object.entries(descriptor?.parts ?? {}).map(([property, id]) => property === id ? property : `${property} -> ${id}`);
    return names.length ? names.join(', ') : t('compilerNoContractItems');
}

interface CompilerSceneBindingStatus {
    ok: boolean;
    message: string;
    scenePath: string;
    scriptPath?: string;
    className?: string;
    contractScene?: string;
}

async function readCompilerSceneBindingStatus(
    projectTree: ProjectFileTreeNode | undefined,
    scenePath: string,
    compilerDocument: NonNullable<ReturnType<typeof getCompilerSceneDocument>>,
    t: Translate,
): Promise<CompilerSceneBindingStatus> {
    if (!projectTree) {
        return {
            ok: false,
            message: t('compilerProjectNotOpened'),
            scenePath,
            className: compilerDocument.descriptor?.className,
            contractScene: compilerDocument.descriptor?.scene,
        };
    }
    const sceneFile = findFileByPath(projectTree, scenePath);
    if (!sceneFile) {
        return {
            ok: false,
            message: `找不到 Scene 文件 ${scenePath}。`,
            scenePath,
            className: compilerDocument.descriptor?.className,
            contractScene: compilerDocument.descriptor?.scene,
        };
    }
    const scriptPath = pairedSceneScriptPath(projectFileRelativePath(projectTree, sceneFile));
    try {
        const binding = await measureSceneViewProfileAsync('inspector.readBindingStatus', () => readCompilerSceneBinding(projectTree, sceneFile));
        return {
            ok: true,
            message: t('compilerBindingOk'),
            scenePath,
            scriptPath,
            className: binding.className,
            contractScene: binding.scenePath,
        };
    } catch (error) {
        return {
            ok: false,
            message: hostErrorMessage(error),
            scenePath,
            scriptPath,
            className: compilerDocument.descriptor?.className,
            contractScene: compilerDocument.descriptor?.scene,
        };
    }
}

function compilerFieldType(key: string, value: unknown) {
    const schema = pixiSceneFieldSchema(key);
    if (schema) {
        return schema.type;
    }
    if (typeof value === 'number') {
        return 'number';
    }
    if (typeof value === 'boolean') {
        return 'boolean';
    }
    return 'string';
}

function compilerContractFieldType(type: string) {
    if (type === 'number') {
        return 'number';
    }
    if (type === 'boolean') {
        return 'boolean';
    }
    if (type === 'color') {
        return 'color';
    }
    return 'string';
}

function compilerField(key: string, value: unknown, type?: string): InspectorFieldModel {
    const schema = pixiSceneFieldSchema(key);
    const enumOptions = schema?.type === 'enum' ? schema.options : undefined;
    return {
        key,
        label: key,
        type: type ? compilerContractFieldType(type) : compilerFieldType(key, value),
        value,
        ...(enumOptions ? { schema: { key, type: 'enum', options: enumOptions } } : {}),
    };
}

function compilerPropValue(node: EditableCompilerNode, key: string) {
    const [root, field, ...rest] = key.split('.');
    if (!field || rest.length > 0) {
        return node.props[key];
    }
    const value = node.props[root];
    return value && typeof value === 'object' ? (value as Record<string, unknown>)[field] : undefined;
}

function compilerTransformFieldValue(node: EditableCompilerNode, key: string) {
    const value = node.props[key];
    if (value !== undefined) {
        return value;
    }
    if (node.kind === 'pixi' && isPixiSceneNodeType(node.type)) {
        const defaultValue = pixiSceneNodeDefaults(node.type)[key];
        if (defaultValue !== undefined) {
            return defaultValue;
        }
    }
    if (key === 'scaleX' || key === 'scaleY') {
        return 1;
    }
    return 0;
}

function compilerTransformFields(node: SelectedCompilerItem): InspectorFieldModel[] {
    if (!node || node.kind === 'slot' || node.kind === 'slotOutlet') {
        return [];
    }
    return pixiSceneTransformProps.map((key) => compilerField(key, compilerTransformFieldValue(node, key)));
}

function compilerLayoutFields(node: SelectedCompilerItem): InspectorFieldModel[] {
    if (!node || node.kind === 'slot' || node.kind === 'slotOutlet') {
        return [];
    }
    return pixiSceneLayoutProps.map((key) => compilerField(key, node.props[key]));
}

function compilerLayoutParentSize(
    compilerDocument: NonNullable<ReturnType<typeof getCompilerSceneDocument>>,
    locator: string | undefined,
) {
    const parent = locator ? compilerParentNode(compilerDocument.template.children, locator) : undefined;
    const parentProps = parent && parent.kind !== 'slotOutlet' ? parent.props : undefined;
    return {
        width: typeof parentProps?.width === 'number'
            ? parentProps.width
            : typeof compilerDocument.template.props.width === 'number'
                ? compilerDocument.template.props.width
                : 0,
        height: typeof parentProps?.height === 'number'
            ? parentProps.height
            : typeof compilerDocument.template.props.height === 'number'
                ? compilerDocument.template.props.height
                : 0,
    };
}

function numberProp(props: Record<string, unknown>, key: string, fallback = 0) {
    return typeof props[key] === 'number' ? props[key] : fallback;
}

function compilerLayoutRect(
    props: Record<string, unknown>,
    parentSize: { width: number; height: number },
) {
    const left = typeof props.left === 'number' ? props.left : undefined;
    const right = typeof props.right === 'number' ? props.right : undefined;
    const horizontal = typeof props.horizontal === 'number' ? props.horizontal : undefined;
    const top = typeof props.top === 'number' ? props.top : undefined;
    const bottom = typeof props.bottom === 'number' ? props.bottom : undefined;
    const vertical = typeof props.vertical === 'number' ? props.vertical : undefined;
    const width = left !== undefined && right !== undefined
        ? Math.max(0, parentSize.width - left - right)
        : numberProp(props, 'width');
    const height = top !== undefined && bottom !== undefined
        ? Math.max(0, parentSize.height - top - bottom)
        : numberProp(props, 'height');
    const x = left !== undefined
        ? left
        : right !== undefined
            ? parentSize.width - right - width
            : horizontal !== undefined
                ? (parentSize.width - width) / 2 + horizontal
                : numberProp(props, 'x');
    const y = top !== undefined
        ? top
        : bottom !== undefined
            ? parentSize.height - bottom - height
            : vertical !== undefined
                ? (parentSize.height - height) / 2 + vertical
                : numberProp(props, 'y');
    return { x, y, width, height };
}

export function compilerLayoutHorizontalAlignment(props: Record<string, unknown>): CompilerHorizontalAlignment {
    if (typeof props.left === 'number' && typeof props.right === 'number') {
        return 'stretch';
    }
    if (typeof props.left === 'number') {
        return 'left';
    }
    if (typeof props.right === 'number') {
        return 'right';
    }
    if (typeof props.horizontal === 'number') {
        return 'center';
    }
    return 'none';
}

export function compilerLayoutVerticalAlignment(props: Record<string, unknown>): CompilerVerticalAlignment {
    if (typeof props.top === 'number' && typeof props.bottom === 'number') {
        return 'stretch';
    }
    if (typeof props.top === 'number') {
        return 'top';
    }
    if (typeof props.bottom === 'number') {
        return 'bottom';
    }
    if (typeof props.vertical === 'number') {
        return 'middle';
    }
    return 'none';
}

export function compilerLayoutAlignmentPatch(
    props: Record<string, unknown>,
    parentSize: { width: number; height: number },
    axis: CompilerLayoutAxis,
    alignment: CompilerLayoutAlignment,
) {
    const rect = compilerLayoutRect(props, parentSize);
    if (axis === 'horizontal') {
        if (alignment === 'left') {
            return { x: undefined, left: rect.x, right: undefined, horizontal: undefined, width: rect.width };
        }
        if (alignment === 'center') {
            return {
                x: undefined,
                left: undefined,
                right: undefined,
                horizontal: rect.x + rect.width / 2 - parentSize.width / 2,
                width: rect.width,
            };
        }
        if (alignment === 'right') {
            return {
                x: undefined,
                left: undefined,
                right: parentSize.width - rect.x - rect.width,
                horizontal: undefined,
                width: rect.width,
            };
        }
        if (alignment === 'stretch') {
            return {
                x: undefined,
                left: rect.x,
                right: parentSize.width - rect.x - rect.width,
                horizontal: undefined,
                width: undefined,
            };
        }
        return { x: rect.x, left: undefined, right: undefined, horizontal: undefined, width: rect.width };
    }
    if (alignment === 'top') {
        return { y: undefined, top: rect.y, bottom: undefined, vertical: undefined, height: rect.height };
    }
    if (alignment === 'middle') {
        return {
            y: undefined,
            top: undefined,
            bottom: undefined,
            vertical: rect.y + rect.height / 2 - parentSize.height / 2,
            height: rect.height,
        };
    }
    if (alignment === 'bottom') {
        return {
            y: undefined,
            top: undefined,
            bottom: parentSize.height - rect.y - rect.height,
            vertical: undefined,
            height: rect.height,
        };
    }
    if (alignment === 'stretch') {
        return {
            y: undefined,
            top: rect.y,
            bottom: parentSize.height - rect.y - rect.height,
            vertical: undefined,
            height: undefined,
        };
    }
    return { y: rect.y, top: undefined, bottom: undefined, vertical: undefined, height: rect.height };
}

function compilerDisplayFieldValue(key: string, value: unknown) {
    if (value !== undefined) {
        return value;
    }
    if (key === 'alpha') {
        return 1;
    }
    if (key === 'visible') {
        return true;
    }
    if (key === 'zIndex') {
        return 0;
    }
    return value;
}

function compilerDisplayFields(node: SelectedCompilerItem): InspectorFieldModel[] {
    if (!node || node.kind === 'slot' || node.kind === 'slotOutlet') {
        return [];
    }
    return pixiSceneDisplayProps.map((key) => compilerField(key, compilerDisplayFieldValue(key, node.props[key])));
}

interface CompilerFieldSection {
    title: string;
    fields: InspectorFieldModel[];
}

interface CompilerSceneInstanceSlotRow {
    name: string;
    childCount: number;
}

export function compilerSceneInstanceSlotRows(
    node: SelectedCompilerItem,
    sceneInterface?: CompilerSceneTemplateInterface,
): CompilerSceneInstanceSlotRow[] {
    if (!node || node.kind !== 'sceneInstance') {
        return [];
    }
    return [
        ...new Set([
            ...Object.keys(sceneInterface?.slots ?? {}),
            ...Object.keys(node.slots),
        ]),
    ].map((name) => ({
        name,
        childCount: node.slots[name]?.length ?? 0,
    }));
}

function compilerPropSections(node: SelectedCompilerItem, sceneInterface?: CompilerSceneTemplateInterface): CompilerFieldSection[] {
    if (!node || node.kind === 'slot' || node.kind === 'slotOutlet') {
        return [];
    }
    if (node.kind === 'sceneInstance' && sceneInterface) {
        const propFields: InspectorFieldModel[] = [];
        const structSections: CompilerFieldSection[] = [];
        for (const [key, contract] of Object.entries(sceneInterface.props)) {
            if (contract.type === 'struct') {
                structSections.push({
                    title: contract.struct,
                    fields: Object.entries(contract.fields).map(([fieldKey, fieldContract]) => compilerField(
                        `${key}.${fieldKey}`,
                        compilerPropValue(node, `${key}.${fieldKey}`) ?? fieldContract.default,
                        fieldContract.type,
                    )),
                });
                continue;
            }
            propFields.push(compilerField(key, node.props[key] ?? contract.default, contract.type));
        }
        return [
            ...structSections,
            ...(propFields.length ? [{ title: 'Props', fields: propFields }] : []),
        ];
    }
    const typeKeys = node.kind === 'pixi' && isPixiSceneNodeType(node.type)
        ? pixiSceneNodePropKeys(node.type)
        : [];
    const customKeys = [
        ...new Set([
            ...Object.keys(node.props),
        ].filter((key) => !compilerKnownPixiProps.has(key) || typeKeys.includes(key))),
    ];
    const sections = node.kind === 'pixi' && isPixiSceneNodeType(node.type)
        ? pixiSceneNodePropGroups(node.type).map(({ group, fields }) => ({
            title: compilerPixiGroupTitles[group],
            fields: fields.map((key) => compilerField(key, node.props[key])),
        }))
        : [];
    const customFields = customKeys
        .filter((key) => !typeKeys.includes(key))
        .map((key) => compilerField(key, node.props[key]));
    return customFields.length
        ? [...sections, { title: 'Props', fields: customFields }]
        : sections;
}

function compilerEventFields(node: SelectedCompilerItem, sceneInterface?: CompilerSceneTemplateInterface): InspectorFieldModel[] {
    if (!node || node.kind !== 'sceneInstance') {
        return [];
    }
    const keys = sceneInterface
        ? Object.keys(sceneInterface.events)
        : Object.keys(node.events);
    return keys.map((key) => ({
        key,
        label: `@${key}`,
        type: 'string',
        value: node.events[key],
    }));
}

function compilerSelectionLocator(document: NonNullable<ReturnType<typeof getCompilerSceneDocument>>) {
    return document.selection.type === 'node' ? document.selection.node : document.scenePath;
}

function compilerSceneInterfaceForInstance(
    compilerDocument: NonNullable<ReturnType<typeof getCompilerSceneDocument>>,
    node: SelectedCompilerItem,
) {
    if (!node || node.kind !== 'sceneInstance') {
        return undefined;
    }
    return compilerDocument.sceneInterfaces[node.scene]
        ?? (compilerDocument.descriptor?.scene
            ? compilerDocument.sceneInterfaces[resolveSceneReference(compilerDocument.descriptor.scene, node.scene)]
            : undefined);
}

function displayFieldLabel(field: InspectorFieldModel, t: Translate) {
    if (field.key === 'x' || field.key === 'y') {
        return field.key.toUpperCase();
    }
    const labelKey = fieldLabelKeys[field.key];
    return labelKey ? t(labelKey) : field.label;
}

function colorToInput(value: unknown) {
    const color = typeof value === 'number' ? value : 0;
    return `#${color.toString(16).padStart(6, '0').slice(-6)}`;
}

function parseNumberValue(value: string) {
    return value.trim() === '' ? undefined : Number(value);
}

function parseFieldValue(type: string, value: string) {
    switch (type) {
        case 'number':
            return parseNumberValue(value);
        case 'color':
            return Number.parseInt(value.replace('#', ''), 16);
        default:
            return parseTextValue(value);
    }
}

function editableFieldDraftValue(field: InspectorFieldModel) {
    return field.type === 'color' ? colorToInput(field.value) : field.value === undefined ? '' : String(field.value);
}

function editableFieldCommitKey(field: InspectorFieldModel) {
    return `${field.key}:${field.type}`;
}

function fieldRowClassName(field: InspectorFieldModel) {
    return field.key === 'text' || field.key === 'src' || field.key === 'texture'
        ? 'editableFieldRow editableFieldRow--wide'
        : 'editableFieldRow';
}

interface InspectorFieldCommitOptions {
    mergeKey?: string;
}

interface EditableFieldRowProps {
    label: string;
    field: InspectorFieldModel;
    warning?: string;
    locked?: boolean;
    onCommit(value: unknown, options?: InspectorFieldCommitOptions): void;
    onAssetDrop?(path: string): void;
}

function EditableFieldRow({
    label,
    field,
    warning,
    locked = false,
    onCommit,
    onAssetDrop,
}: EditableFieldRowProps) {
    const t = useI18n();
    const value = field.value;
    const [draft, setDraft] = useState(() => editableFieldDraftValue(field));
    const autoCommitTimer = useRef<number | undefined>(undefined);
    const committedValue = useRef(value);
    const editSession = useRef(0);

    useEffect(() => {
        committedValue.current = field.value;
        setDraft(editableFieldDraftValue(field));
    }, [field.key, field.type, field.value]);

    useEffect(() => () => {
        if (autoCommitTimer.current !== undefined) {
            window.clearTimeout(autoCommitTimer.current);
        }
    }, []);

    const commitDraft = (nextDraft = draft) => {
        const nextValue = parseFieldValue(field.type, nextDraft);
        if (field.type === 'number' && typeof nextValue === 'number' && Number.isNaN(nextValue)) {
            return;
        }
        if (nextValue !== committedValue.current) {
            committedValue.current = nextValue;
            onCommit(nextValue, { mergeKey: `${editableFieldCommitKey(field)}:${editSession.current}` });
        }
    };

    const startEditSession = () => {
        editSession.current += 1;
    };

    const commitDraftImmediately = () => {
        if (autoCommitTimer.current !== undefined) {
            window.clearTimeout(autoCommitTimer.current);
            autoCommitTimer.current = undefined;
        }
        commitDraft();
    };

    const scheduleAutoCommit = (nextDraft: string) => {
        if (field.type === 'color') {
            return;
        }
        if (autoCommitTimer.current !== undefined) {
            window.clearTimeout(autoCommitTimer.current);
        }
        autoCommitTimer.current = window.setTimeout(() => {
            autoCommitTimer.current = undefined;
            commitDraft(nextDraft);
        }, 300);
    };

    let control;
    if (field.type === 'boolean') {
        control = (
            <Checkbox
                aria-label={label}
                disabled={locked}
                isSelected={Boolean(value)}
                onChange={onCommit}
            />
        );
    } else if (field.type === 'enum' && field.schema?.options) {
        control = (
            <Select
                aria-label={label}
                disabled={locked}
                onSelectionChange={(nextValue) => onCommit(parseTextValue(nextValue))}
                options={[
                    { label: t('unset'), value: '' },
                    ...field.schema.options.map((option: string | number) => ({
                        label: String(option),
                        value: String(option),
                    })),
                ]}
                selectedKey={value === undefined ? '' : String(value)}
            />
        );
    } else if (field.type === 'number') {
        control = (
            <TextField
                aria-label={label}
                disabled={locked}
                inputProps={{
                    inputMode: 'decimal',
                    onFocus: startEditSession,
                    onBlur: commitDraftImmediately,
                    onKeyDown: (event) => {
                        if (event.key === 'Enter') {
                            event.currentTarget.blur();
                        }
                    },
                    type: 'text',
                }}
                onChange={(nextDraft) => {
                    setDraft(nextDraft);
                    scheduleAutoCommit(nextDraft);
                }}
                value={draft}
            />
        );
    } else {
        control = (
            <TextField
                aria-label={label}
                disabled={locked}
                inputProps={{
                    type: field.type === 'color' ? 'color' : 'text',
                    onFocus: startEditSession,
                    onKeyDown: (event) => {
                        if (event.key === 'Enter') {
                            event.currentTarget.blur();
                        }
                    },
                }}
                onBlur={commitDraftImmediately}
                onChange={(nextValue) => {
                    setDraft(nextValue);
                    if (field.type === 'color') {
                        onCommit(parseFieldValue(field.type, nextValue), { mergeKey: `${editableFieldCommitKey(field)}:${editSession.current}` });
                    } else {
                        scheduleAutoCommit(nextValue);
                    }
                }}
                value={draft}
            />
        );
    }

    const row = (
        <div className={[fieldRowClassName(field), warning ? 'warning' : ''].filter(Boolean).join(' ')}>
            <div className="editableFieldLabel">
                <span>{label}</span>
                <div data-field-key={field.key}>{control}</div>
            </div>
            {warning ? <small>{warning}</small> : null}
        </div>
    );

    return onAssetDrop ? (
        <DropZone
            acceptedTypes={[assetDragDataType]}
            className="fieldDropZone"
            onPayloadDrop={(payload) => onAssetDrop(payload.data)}
        >
            {row}
        </DropZone>
    ) : row;
}

const horizontalAlignmentOptions: { label: string; value: CompilerHorizontalAlignment }[] = [
    { label: 'None', value: 'none' },
    { label: 'Left', value: 'left' },
    { label: 'Center', value: 'center' },
    { label: 'Right', value: 'right' },
    { label: 'Stretch', value: 'stretch' },
];

const verticalAlignmentOptions: { label: string; value: CompilerVerticalAlignment }[] = [
    { label: 'None', value: 'none' },
    { label: 'Top', value: 'top' },
    { label: 'Middle', value: 'middle' },
    { label: 'Bottom', value: 'bottom' },
    { label: 'Stretch', value: 'stretch' },
];

function compilerLayoutVisibleFields(
    horizontal: CompilerHorizontalAlignment,
    vertical: CompilerVerticalAlignment,
) {
    const fields: string[] = [];
    if (horizontal === 'none') {
        fields.push('x', 'width');
    } else if (horizontal === 'left') {
        fields.push('left', 'width');
    } else if (horizontal === 'center') {
        fields.push('horizontal', 'width');
    } else if (horizontal === 'right') {
        fields.push('right', 'width');
    } else {
        fields.push('left', 'right');
    }
    if (vertical === 'none') {
        fields.push('y', 'height');
    } else if (vertical === 'top') {
        fields.push('top', 'height');
    } else if (vertical === 'middle') {
        fields.push('vertical', 'height');
    } else if (vertical === 'bottom') {
        fields.push('bottom', 'height');
    } else {
        fields.push('top', 'bottom');
    }
    return fields;
}

interface CompilerLayoutAlignmentEditorProps {
    node: EditableCompilerNode;
    parentSize: { width: number; height: number };
    onCommit(key: string, value: unknown, options?: InspectorFieldCommitOptions): void;
    onCommitMany(props: Record<string, string | number | boolean | undefined>, axis: CompilerLayoutAxis): void;
}

function CompilerLayoutAlignmentEditor({
    node,
    parentSize,
    onCommit,
    onCommitMany,
}: CompilerLayoutAlignmentEditorProps) {
    const horizontal = compilerLayoutHorizontalAlignment(node.props);
    const vertical = compilerLayoutVerticalAlignment(node.props);
    const visibleFields = compilerLayoutVisibleFields(horizontal, vertical);

    const commitAlignment = (axis: CompilerLayoutAxis, alignment: CompilerLayoutAlignment) => {
        onCommitMany(
            compilerLayoutAlignmentPatch(node.props, parentSize, axis, alignment),
            axis,
        );
    };

    return (
        <div className="layoutAlignmentEditor">
            <div className="layoutAlignmentGroup">
                <span className="layoutAlignmentTitle">Horizontal Alignment</span>
                <div className="layoutSegmented" role="group" aria-label="Horizontal Alignment">
                    {horizontalAlignmentOptions.map((option) => (
                        <button
                            aria-pressed={horizontal === option.value}
                            className={horizontal === option.value ? 'isActive' : undefined}
                            key={option.value}
                            onClick={() => commitAlignment('horizontal', option.value)}
                            type="button"
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="layoutAlignmentGroup">
                <span className="layoutAlignmentTitle">Vertical Alignment</span>
                <div className="layoutSegmented" role="group" aria-label="Vertical Alignment">
                    {verticalAlignmentOptions.map((option) => (
                        <button
                            aria-pressed={vertical === option.value}
                            className={vertical === option.value ? 'isActive' : undefined}
                            key={option.value}
                            onClick={() => commitAlignment('vertical', option.value)}
                            type="button"
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="fieldGrid inspectorCompactGrid">
                {visibleFields.map((key) => (
                    <EditableFieldRow
                        field={compilerField(key, node.props[key] ?? (key === 'width' ? parentSize.width : key === 'height' ? parentSize.height : undefined))}
                        key={key}
                        label={key}
                        onCommit={(value, options) => onCommit(key, value, options)}
                    />
                ))}
            </div>
        </div>
    );
}

export function InspectorPanel() {
    useCompilerSceneRevision();
    const t = useI18n();
    const openedScenePath = useEditorStore((state) => state.openedScenePath);
    const projectTree = useEditorStore((state) => state.projectTree);
    const compilerDocument = getCompilerSceneDocument();
    const compilerScenePath = compilerDocument?.scenePath;
    const compilerClassName = compilerDocument?.descriptor?.className;
    const compilerContractScene = compilerDocument?.descriptor?.scene;
    const compilerTemplateName = compilerDocument?.template.name;
    const [error, setError] = useState<string>();
    const [compilerBindingStatus, setCompilerBindingStatus] = useState<CompilerSceneBindingStatus>();

    useEffect(() => {
        setError(undefined);
    }, [openedScenePath, compilerDocument?.selection]);

    useEffect(() => {
        if (!openedScenePath || !compilerDocument || compilerScenePath !== openedScenePath) {
            setCompilerBindingStatus(undefined);
            return;
        }
        let cancelled = false;
        void readCompilerSceneBindingStatus(projectTree, openedScenePath, compilerDocument, t)
            .then((status) => {
                if (!cancelled) {
                    setCompilerBindingStatus(status);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [
        compilerClassName,
        compilerContractScene,
        compilerScenePath,
        compilerTemplateName,
        openedScenePath,
        projectTree,
        t,
    ]);

    if (openedScenePath && compilerDocument?.scenePath === openedScenePath) {
        const publicInterface = compilerDocument.descriptor?.interface ?? compilerDocument.template.interface;
        const selectedCompiler = compilerDocument.selection.type === 'node'
            ? selectedCompilerSlot(compilerDocument.template.children, compilerDocument.selection.node) ?? selectedCompilerNode(compilerDocument.template.children, compilerDocument.selection.node)
            : undefined;
        const selectedSceneInterface = compilerSceneInterfaceForInstance(compilerDocument, selectedCompiler);
        const selectedSlotRows = compilerSceneInstanceSlotRows(selectedCompiler, selectedSceneInterface);
        const compilerTransformEditorFields = compilerTransformFields(selectedCompiler);
        const compilerLayoutEditorFields = compilerLayoutFields(selectedCompiler);
        const compilerDisplayEditorFields = compilerDisplayFields(selectedCompiler);
        const compilerPropEditorSections = compilerPropSections(selectedCompiler, selectedSceneInterface);
        const compilerEventEditorFields = compilerEventFields(selectedCompiler, selectedSceneInterface);
        const compilerSelection = compilerDocument.selection.type === 'node'
            ? compilerDocument.selection.node
            : undefined;
        const compilerLayoutParent = compilerLayoutParentSize(compilerDocument, compilerSelection);
        const sceneSelected = !selectedCompiler;
        const canEditCompilerNode = compilerSelection && selectedCompiler && selectedCompiler.kind !== 'slot' && selectedCompiler.kind !== 'slotOutlet';
        const canEditCompilerSlotOutlet = compilerSelection && selectedCompiler?.kind === 'slotOutlet';
        const mergeCompilerSceneField = (key: string, options?: InspectorFieldCommitOptions) => options?.mergeKey
            ? { mergeKey: `inspector:scene:${key}:${options.mergeKey}` }
            : undefined;
        const mergeCompilerNodeField = (key: string, options?: InspectorFieldCommitOptions) => options?.mergeKey
            ? { mergeKey: `inspector:node:${compilerSelection}:${key}:${options.mergeKey}` }
            : undefined;
        const mergeCompilerEventField = (key: string, options?: InspectorFieldCommitOptions) => options?.mergeKey
            ? { mergeKey: `inspector:event:${compilerSelection}:${key}:${options.mergeKey}` }
            : undefined;
        const commitCompilerSceneName = (value: unknown, options?: InspectorFieldCommitOptions) => {
            updateCompilerSceneTemplate({ name: typeof value === 'string' ? value : '' }, mergeCompilerSceneField('name', options));
        };
        const commitCompilerSceneProp = (key: string, value: unknown, options?: InspectorFieldCommitOptions) => {
            if (typeof value === 'object') {
                return;
            }
            updateCompilerSceneTemplate({
                props: {
                    [key]: value as string | number | boolean | undefined,
                },
            }, mergeCompilerSceneField(key, options));
        };
        const commitCompilerId = (value: unknown, options?: InspectorFieldCommitOptions) => {
            if (!canEditCompilerNode) {
                return;
            }
            updateCompilerSceneNode(compilerSelection, { id: typeof value === 'string' ? value : '' }, mergeCompilerNodeField('id', options));
        };
        const commitCompilerProp = (key: string, value: unknown, options?: InspectorFieldCommitOptions) => {
            if (!canEditCompilerNode || typeof value === 'object') {
                return;
            }
            updateCompilerSceneNode(compilerSelection, {
                props: {
                    [key]: value as string | number | boolean | undefined,
                },
            }, mergeCompilerNodeField(key, options));
        };
        const commitCompilerProps = (
            props: Record<string, string | number | boolean | undefined>,
            mergeKey: string,
        ) => {
            if (!canEditCompilerNode) {
                return;
            }
            updateCompilerSceneNode(compilerSelection, {
                props,
            }, { mergeKey: `inspector:node:${compilerSelection}:${mergeKey}` });
        };
        const commitCompilerTextureAsset = (key: string, path: string) => {
            if (!projectTree) {
                setError(t('compilerProjectNotOpened'));
                return;
            }
            const resolved = resolveProjectAssetReference(projectTree, path);
            if (!resolved.ok) {
                setError(resolved.error);
                return;
            }
            commitCompilerProp(key, resolved.value);
            setError(undefined);
        };
        const commitCompilerEvent = (key: string, value: unknown, options?: InspectorFieldCommitOptions) => {
            if (!canEditCompilerNode || selectedCompiler?.kind !== 'sceneInstance') {
                return;
            }
            updateCompilerSceneNode(compilerSelection, {
                events: {
                    [key]: typeof value === 'string' ? value : undefined,
                },
            }, mergeCompilerEventField(key, options));
        };
        const commitCompilerSlotName = (value: unknown, options?: InspectorFieldCommitOptions) => {
            if (!canEditCompilerSlotOutlet) {
                return;
            }
            updateCompilerSceneNode(compilerSelection, {
                slotName: typeof value === 'string' ? value : '',
            }, mergeCompilerNodeField('slotName', options));
        };
        const openCompilerScript = async () => {
            if (!projectTree) {
                setError(t('compilerProjectNotOpened'));
                return;
            }
            try {
                const sceneFile = findFileByPath(projectTree, compilerDocument.scenePath);
                await openCompilerSceneScriptFile(projectTree, compilerDocument.template, sceneFile);
                setError(undefined);
            } catch (openError) {
                setError(hostErrorMessage(openError));
            }
        };

        return (
            <div className="panelSurface inspectorSurface" data-testid="compiler-scene-inspector">
                {error ? <div className="errorBox">{error}</div> : null}
                <section className="identity">
                    <span>{t('compilerSceneKind')}</span>
                    <strong>{compilerNodeName(selectedCompiler, compilerDocument.template.name, t)}</strong>
                    <small>{compilerNodeKind(selectedCompiler, t)} · {compilerSelectionLocator(compilerDocument)}</small>
                </section>
                {sceneSelected ? (
                    <section className="inspectorSection inspectorSection--scene">
                        <h3>{t('compilerSceneSection')}</h3>
                        <div className="fieldStack">
                            <EditableFieldRow
                                field={compilerField('name', compilerDocument.template.name)}
                                label="name"
                                onCommit={commitCompilerSceneName}
                            />
                            <EditableFieldRow
                                field={compilerField('width', compilerDocument.template.props.width)}
                                label="width"
                                onCommit={(value, options) => commitCompilerSceneProp('width', value, options)}
                            />
                            <EditableFieldRow
                                field={compilerField('height', compilerDocument.template.props.height)}
                                label="height"
                                onCommit={(value, options) => commitCompilerSceneProp('height', value, options)}
                            />
                        </div>
                    </section>
                ) : null}
                {selectedCompiler ? (
                    <>
                        <section className="inspectorSection inspectorSection--identity">
                            <h3>{t('compilerIdentitySection')}</h3>
                            <div className="fieldStack">
                                {'id' in selectedCompiler ? (
                                    <EditableFieldRow
                                        field={compilerField('id', selectedCompiler.id)}
                                        label="id"
                                        onCommit={commitCompilerId}
                                    />
                                ) : null}
                                {'type' in selectedCompiler ? <FieldRow label="type" value={selectedCompiler.type} /> : null}
                                {selectedCompiler.kind === 'sceneInstance' ? <FieldRow label="scene" value={selectedCompiler.scene} /> : null}
                                {selectedCompiler.kind === 'slotOutlet' ? (
                                    <EditableFieldRow
                                        field={compilerField('slotName', selectedCompiler.name)}
                                        label="slot"
                                        onCommit={commitCompilerSlotName}
                                    />
                                ) : null}
                                {selectedCompiler.kind === 'slot' ? (
                                    <>
                                        <FieldRow label="kind" value={t('compilerSlotPlacementLabel')} />
                                        <FieldRow label="name" value={selectedCompiler.name} />
                                        <FieldRow label={t('compilerOwner')} value={selectedCompiler.owner} />
                                        <FieldRow label={t('compilerChildrenLabel')} value={t('compilerChildrenCount', { count: selectedCompiler.childCount })} />
                                    </>
                                ) : null}
                            </div>
                        </section>
                        {compilerTransformEditorFields.length ? (
                            <section className="inspectorSection inspectorSection--transform">
                                <h3>{t('compilerTransformSection')}</h3>
                                <div className="fieldGrid inspectorTransformGrid">
                                    {compilerTransformEditorFields.map((field) => (
                                        <EditableFieldRow
                                            field={field}
                                            key={field.key}
                                            label={field.label}
                                            onCommit={(value, options) => commitCompilerProp(field.key, value, options)}
                                        />
                                    ))}
                                </div>
                            </section>
                        ) : null}
                        {compilerLayoutEditorFields.length ? (
                            <section className="inspectorSection inspectorSection--layout">
                                <h3>Layout</h3>
                                {canEditCompilerNode ? (
                                    <CompilerLayoutAlignmentEditor
                                        node={selectedCompiler}
                                        onCommit={commitCompilerProp}
                                        onCommitMany={(props, axis) => commitCompilerProps(props, `layout:${axis}`)}
                                        parentSize={compilerLayoutParent}
                                    />
                                ) : null}
                            </section>
                        ) : null}
                        {compilerDisplayEditorFields.length ? (
                            <section className="inspectorSection inspectorSection--display">
                                <h3>{t('compilerDisplaySection')}</h3>
                                <div className="fieldGrid inspectorCompactGrid">
                                    {compilerDisplayEditorFields.map((field) => (
                                        <EditableFieldRow
                                            field={field}
                                            key={field.key}
                                            label={field.label}
                                            onCommit={(value, options) => commitCompilerProp(field.key, value, options)}
                                        />
                                    ))}
                                </div>
                            </section>
                        ) : null}
                        {compilerPropEditorSections.map((section) => (
                            section.fields.length ? (
                                <section className="inspectorSection inspectorSection--props" key={section.title}>
                                    <h3>{section.title === 'Props' ? t('compilerPropsSection') : section.title}</h3>
                                    <div className="fieldGrid inspectorPropGrid">
                                        {section.fields.map((field) => (
                                            <EditableFieldRow
                                                field={field}
                                                key={field.key}
                                                label={field.label}
                                                onAssetDrop={field.key === 'texture'
                                                    ? (path) => commitCompilerTextureAsset(field.key, path)
                                                    : undefined}
                                                onCommit={(value, options) => commitCompilerProp(field.key, value, options)}
                                            />
                                        ))}
                                    </div>
                                </section>
                            ) : null
                        ))}
                        {compilerEventEditorFields.length ? (
                            <section className="inspectorSection inspectorSection--events">
                                <h3>{t('compilerEventsSection')}</h3>
                                <div className="fieldGrid inspectorPropGrid">
                                    {compilerEventEditorFields.map((field) => (
                                        <EditableFieldRow
                                            field={field}
                                            key={`event:${field.key}`}
                                            label={field.label}
                                            onCommit={(value, options) => commitCompilerEvent(field.key, value, options)}
                                        />
                                    ))}
                                </div>
                            </section>
                        ) : null}
                        {selectedSlotRows.length ? (
                            <section className="inspectorSection inspectorSection--slots">
                                <h3>{t('compilerSlotsSection')}</h3>
                                <p className="inspectorHint">{t('compilerSlotsReadonlyHint')}</p>
                                <div className="fieldStack">
                                    {selectedSlotRows.map((slot) => (
                                        <FieldRow
                                            key={slot.name}
                                            label={t('compilerSlotLabel', { name: slot.name })}
                                            value={t('compilerChildrenCount', { count: slot.childCount })}
                                        />
                                    ))}
                                </div>
                            </section>
                        ) : null}
                    </>
                ) : null}
                {sceneSelected ? (
                    <>
                        <section className="inspectorSection inspectorSection--scene">
                            <h3>{t('compilerSceneSection')}</h3>
                            <div className="fieldStack">
                                <FieldRow label="name" value={compilerDocument.template.name} />
                                <FieldRow label="width" value={compilerDocument.template.props.width} />
                                <FieldRow label="height" value={compilerDocument.template.props.height} />
                                <FieldRow label="script" value={compilerBindingStatus?.scriptPath} />
                                <FieldRow label={t('compilerClass')} value={compilerDocument.descriptor?.className} />
                                <FieldRow label={t('compilerPath')} value={compilerDocument.scenePath} />
                            </div>
                        </section>
                        <section className="inspectorSection inspectorSection--binding">
                            <div className="sectionHeader">
                                <h3>{t('compilerScriptBindingSection')}</h3>
                                <span className={compilerBindingStatus?.ok ? 'bindingState ok' : 'bindingState error'}>
                                    {compilerBindingStatus?.message ?? t('compilerBindingChecking')}
                                </span>
                            </div>
                            <div className="fieldStack">
                                <FieldRow label="scene" value={compilerBindingStatus?.scenePath ?? compilerDocument.scenePath} />
                                <FieldRow label={t('compilerContract')} value={compilerBindingStatus?.contractScene ?? compilerDocument.descriptor?.scene} />
                                <FieldRow label="script" value={compilerBindingStatus?.scriptPath} />
                                <FieldRow label={t('compilerClass')} value={compilerBindingStatus?.className ?? compilerDocument.descriptor?.className} />
                                <div className="inspectorActionRow">
                                    <button onClick={openCompilerScript} type="button">{t('compilerOpenScript')}</button>
                                </div>
                            </div>
                        </section>
                        <section className="inspectorSection inspectorSection--contract">
                            <h3>{t('compilerPublicContractSection')}</h3>
                            <p className="inspectorHint">{t('compilerPublicContractHint')}</p>
                            <div className="fieldStack">
                                <FieldRow label="props" value={`${contractCount(publicInterface, 'props')}: ${contractNames(publicInterface, 'props', t)}`} />
                                <FieldRow label="events" value={`${contractCount(publicInterface, 'events')}: ${contractNames(publicInterface, 'events', t)}`} />
                                <FieldRow label="slots" value={`${contractCount(publicInterface, 'slots')}: ${contractNames(publicInterface, 'slots', t)}`} />
                                <FieldRow label="parts" value={partNames(compilerDocument.descriptor, t)} />
                            </div>
                        </section>
                    </>
                ) : null}
            </div>
        );
    }

    return (
        <div className="panelSurface inspectorSurface panelEmptyState">
            <strong>{t('inspectorEmptyTitle')}</strong>
            <span>{t('inspectorEmptyHint')}</span>
        </div>
    );
}
