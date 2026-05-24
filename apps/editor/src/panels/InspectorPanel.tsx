import { useEffect, useState } from 'react';
import {
    createComponentSpecFromSchema,
    isLocked,
    listPaletteComponents,
    validateDesignTokenValue,
} from 'pixifact';
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
    pixiSceneNodePropGroups,
    pixiSceneNodePropKeys,
    type PixiScenePropGroup,
    pixiSceneTransformProps,
} from '../../../../packages/pixifact/src/compiler/pixiNodeSchema';
import type {
    SceneCommand,
    SceneDocument,
    InspectorComponentModel,
    InspectorFieldModel,
    InspectorNodeModel,
    PaletteComponentItem,
    RectTransformSpec,
} from 'pixifact';
import { IconButton } from '../components/IconButton';
import {
    Checkbox,
    DropZone,
    NumberField,
    Select,
    TextField,
} from '../components/system';
import { refreshSceneDocument } from '../document/sceneDocumentController';
import { useI18n } from '../i18n';
import type { I18nKey } from '../i18n';
import { editorDragDataTypes } from '../services/dragPayload';
import type {
    CompilerSceneScriptInterface,
    CompilerSceneTemplateInterface,
    CompilerSceneTemplateNode,
    ProjectFileTreeNode,
} from '../services/projectFileTree';
import {
    findFileByPath,
    openCompilerSceneScriptFile,
    readCompilerSceneScriptInterface,
} from '../services/projectFileTree';
import { hostErrorMessage } from '../services/hostBridge';
import { FieldRow, formatValue, parseTextValue, selectedNodeId, useCompilerSceneRevision, useDocumentRevision } from './common';
import { useEditorStore } from '../editorStore';

const nodePropLabelKeys: Record<'id' | 'key' | 'role' | 'name', I18nKey | undefined> = {
    id: undefined,
    key: undefined,
    role: 'role',
    name: 'name',
};

const fieldLabelKeys: Record<string, I18nKey> = {
    width: 'width',
    height: 'height',
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

interface SelectedCompilerSlot {
    kind: 'slot';
    owner: string;
    name: string;
    childCount: number;
}

type SelectedCompilerItem = CompilerSceneTemplateNode | SelectedCompilerSlot | undefined;

const compilerKnownPixiProps = new Set<string>(pixiSceneKnownProps);
const compilerPixiGroupTitles: Record<PixiScenePropGroup, string> = {
    transform: 'Transform',
    display: 'Display',
    sprite: 'Sprite',
    nineSlice: 'Nine Slice',
    tiling: 'Tiling',
    text: 'Text',
    graphics: 'Graphics',
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

function compilerNodeKind(node: SelectedCompilerItem) {
    if (!node) {
        return 'Scene';
    }
    if (node.kind === 'slot') {
        return 'slot';
    }
    if (node.kind === 'slotOutlet') {
        return 'slot';
    }
    if (node.kind === 'sceneInstance') {
        return 'Scene Instance';
    }
    return node.type;
}

function compilerNodeName(node: SelectedCompilerItem, sceneName: string) {
    if (!node) {
        return sceneName;
    }
    if (node.kind === 'slot') {
        return `slot: ${node.name}`;
    }
    if (node.kind === 'slotOutlet') {
        return node.name;
    }
    return node.id ?? compilerNodeKind(node);
}

function contractCount(contract: CompilerSceneScriptInterface['interface'] | undefined, key: keyof CompilerSceneScriptInterface['interface']) {
    return Object.keys(contract?.[key] ?? {}).length;
}

function contractNames(contract: CompilerSceneScriptInterface['interface'] | undefined, key: keyof CompilerSceneScriptInterface['interface']) {
    const names = Object.keys(contract?.[key] ?? {});
    return names.length ? names.join(', ') : 'none';
}

function partNames(descriptor: CompilerSceneScriptInterface | undefined) {
    const names = Object.entries(descriptor?.parts ?? {}).map(([property, id]) => property === id ? property : `${property} -> ${id}`);
    return names.length ? names.join(', ') : 'none';
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
): Promise<CompilerSceneBindingStatus> {
    const template = compilerDocument.template;
    if (!projectTree) {
        return {
            ok: false,
            message: '未打开项目。',
            scenePath,
            scriptPath: template.script?.path,
            className: template.script?.className,
            contractScene: compilerDocument.descriptor?.scene,
        };
    }
    if (!template.script) {
        return {
            ok: false,
            message: 'Scene 未绑定脚本。',
            scenePath,
        };
    }
    const sceneFile = findFileByPath(projectTree, scenePath);
    if (!sceneFile) {
        return {
            ok: false,
            message: `找不到 Scene 文件 ${scenePath}。`,
            scenePath,
            scriptPath: template.script.path,
            className: template.script.className,
            contractScene: compilerDocument.descriptor?.scene,
        };
    }
    try {
        const descriptor = await readCompilerSceneScriptInterface(projectTree, sceneFile, template);
        return {
            ok: true,
            message: '绑定正常',
            scenePath,
            scriptPath: template.script.path,
            className: descriptor.className,
            contractScene: descriptor.scene,
        };
    } catch (error) {
        return {
            ok: false,
            message: hostErrorMessage(error),
            scenePath,
            scriptPath: template.script.path,
            className: template.script.className,
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

function compilerTransformFields(node: SelectedCompilerItem): InspectorFieldModel[] {
    if (!node || node.kind === 'slot' || node.kind === 'slotOutlet') {
        return [];
    }
    return pixiSceneTransformProps.map((key) => compilerField(key, node.props[key]));
}

function compilerDisplayFields(node: SelectedCompilerItem): InspectorFieldModel[] {
    if (!node || node.kind === 'slot' || node.kind === 'slotOutlet') {
        return [];
    }
    return pixiSceneDisplayProps.map((key) => compilerField(key, node.props[key]));
}

interface CompilerFieldSection {
    title: string;
    fields: InspectorFieldModel[];
}

function compilerPropSections(node: SelectedCompilerItem, sceneInterface?: CompilerSceneTemplateInterface): CompilerFieldSection[] {
    if (!node || node.kind === 'slot' || node.kind === 'slotOutlet') {
        return [];
    }
    if (node.kind === 'sceneInstance' && sceneInterface) {
        return [{
            title: 'Props',
            fields: Object.entries(sceneInterface.props).map(([key, contract]) => compilerField(key, node.props[key] ?? contract.default, contract.type)),
        }];
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

function nodePropLabel(key: 'id' | 'key' | 'role' | 'name', t: Translate) {
    const labelKey = nodePropLabelKeys[key];
    return labelKey ? t(labelKey) : key.toUpperCase();
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

function componentLocator(component: InspectorComponentModel) {
    return component.id ?? component.type;
}

function nodeKindLabel(kind: InspectorNodeModel['kind'], t: Translate) {
    switch (kind) {
        case 'container':
            return t('nodeKindContainer');
        case 'image':
            return t('nodeKindImage');
        case 'text':
            return t('nodeKindText');
        case 'input':
            return t('nodeKindInput');
        case 'shape':
            return t('nodeKindShape');
    }
}

function displaySectionTitle(kind: InspectorNodeModel['kind'], t: Translate) {
    switch (kind) {
        case 'image':
            return t('inspectorImageDisplay');
        case 'text':
            return t('inspectorTextDisplay');
        case 'input':
            return t('inspectorInputDisplay');
        case 'shape':
            return t('inspectorShapeDisplay');
        case 'container':
            return '';
    }
}

interface EditableFieldRowProps {
    label: string;
    field: InspectorFieldModel;
    warning?: string;
    locked?: boolean;
    actions?: readonly { key: string; label?: string }[];
    onCommit(value: unknown): void;
    onToggleLock?(): void;
}

function EditableFieldRow({
    label,
    field,
    warning,
    locked = false,
    actions = [],
    onCommit,
    onToggleLock,
}: EditableFieldRowProps) {
    const t = useI18n();
    const value = field.value;
    const [draft, setDraft] = useState(() => field.type === 'color' ? colorToInput(value) : value === undefined ? '' : String(value));

    useEffect(() => {
        setDraft(field.type === 'color' ? colorToInput(field.value) : field.value === undefined ? '' : String(field.value));
    }, [field.key, field.type, field.value]);

    const commitDraft = () => {
        const nextValue = parseFieldValue(field.type, draft);
        if (field.type === 'number' && typeof nextValue === 'number' && Number.isNaN(nextValue)) {
            return;
        }
        if (nextValue !== value) {
            onCommit(nextValue);
        }
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
                    ...field.schema.options.map((option) => ({
                        label: String(option),
                        value: String(option),
                    })),
                ]}
                selectedKey={value === undefined ? '' : String(value)}
            />
        );
    } else if (field.type === 'event') {
        control = (
            <Select
                aria-label={label}
                disabled={locked}
                onSelectionChange={(nextValue) => onCommit(parseTextValue(nextValue))}
                options={[
                    { label: t('unbound'), value: '' },
                    ...actions.map((action) => ({
                        label: action.label ? `${action.label} (${action.key})` : action.key,
                        value: action.key,
                    })),
                ]}
                selectedKey={value === undefined ? '' : String(value)}
            />
        );
    } else if (field.type === 'number') {
        control = (
            <NumberField
                aria-label={label}
                disabled={locked}
                inputProps={{
                    onBlur: commitDraft,
                    onKeyDown: (event) => {
                        if (event.key === 'Enter') {
                            event.currentTarget.blur();
                        }
                    },
                }}
                onChange={(nextValue) => setDraft(Number.isNaN(nextValue) ? '' : String(nextValue))}
                value={draft.trim() === '' ? NaN : Number(draft)}
            />
        );
    } else {
        control = (
            <TextField
                aria-label={label}
                disabled={locked}
                inputProps={{
                    type: field.type === 'color' ? 'color' : 'text',
                    onKeyDown: (event) => {
                        if (event.key === 'Enter') {
                            event.currentTarget.blur();
                        }
                    },
                }}
                onBlur={commitDraft}
                onChange={(nextValue) => {
                    setDraft(nextValue);
                    if (field.type === 'color') {
                        onCommit(parseFieldValue(field.type, nextValue));
                    }
                }}
                value={draft}
            />
        );
    }

    return (
        <div className={warning ? 'editableFieldRow warning' : 'editableFieldRow'}>
            <label>
                <span>{label}</span>
                <div data-field-key={field.key}>{control}</div>
            </label>
            {onToggleLock ? (
                <IconButton
                    active={locked}
                    className="lockButton"
                    icon={locked ? 'lock' : 'unlock'}
                    label={locked ? t('unlockField') : t('lockField')}
                    onClick={onToggleLock}
                />
            ) : null}
            {warning ? <small>{warning}</small> : null}
        </div>
    );
}

function nodePropField(key: 'id' | 'key' | 'role' | 'name', value: unknown, t: Translate): InspectorFieldModel {
    return {
        key,
        label: nodePropLabel(key, t),
        type: 'string',
        value,
    };
}

function designWarning(document: SceneDocument, target: string, prop: string, value: unknown) {
    return validateDesignTokenValue(document.designTokens, target, prop, value)?.message;
}

function paletteDisabledReason(item: PaletteComponentItem, t: Translate) {
    return item.disabledReason
        ? item.disabledReason.replace('already exists on this node.', t('componentAlreadyExists'))
        : undefined;
}

export function InspectorPanel({ document }: { document?: SceneDocument }) {
    const revision = useDocumentRevision();
    useCompilerSceneRevision();
    const t = useI18n();
    const openedScenePath = useEditorStore((state) => state.openedScenePath);
    const projectTree = useEditorStore((state) => state.projectTree);
    const compilerDocument = getCompilerSceneDocument();
    const selected = document ? selectedNodeId(document) : undefined;
    const model = document?.getInspectorModel();
    const [error, setError] = useState<string>();
    const [componentPickerOpen, setComponentPickerOpen] = useState(false);
    const [actionText, setActionText] = useState(() => t('inspectorDefaultAction'));
    const [compilerBindingStatus, setCompilerBindingStatus] = useState<CompilerSceneBindingStatus>();

    useEffect(() => {
        setError(undefined);
        setComponentPickerOpen(false);
        setActionText(t('inspectorDefaultAction'));
    }, [revision, selected, t]);

    useEffect(() => {
        if (!openedScenePath || !compilerDocument || compilerDocument.scenePath !== openedScenePath) {
            setCompilerBindingStatus(undefined);
            return;
        }
        let cancelled = false;
        void readCompilerSceneBindingStatus(projectTree, openedScenePath, compilerDocument)
            .then((status) => {
                if (!cancelled) {
                    setCompilerBindingStatus(status);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [
        compilerDocument,
        openedScenePath,
        projectTree,
        compilerDocument?.scenePath,
        compilerDocument?.template.script?.path,
        compilerDocument?.template.script?.className,
        compilerDocument?.descriptor?.scene,
    ]);

    if (openedScenePath && compilerDocument?.scenePath === openedScenePath) {
        const publicInterface = compilerDocument.descriptor?.interface ?? compilerDocument.template.interface;
        const selectedCompiler = compilerDocument.selection.type === 'node'
            ? selectedCompilerSlot(compilerDocument.template.children, compilerDocument.selection.node) ?? selectedCompilerNode(compilerDocument.template.children, compilerDocument.selection.node)
            : undefined;
        const selectedSceneInterface = selectedCompiler?.kind === 'sceneInstance'
            ? compilerDocument.sceneInterfaces[selectedCompiler.scene]
            : undefined;
        const selectedSlots = selectedCompiler?.kind === 'sceneInstance'
            ? Object.keys(selectedSceneInterface?.slots ?? selectedCompiler.slots)
            : selectedCompiler?.kind === 'slotOutlet'
                ? [selectedCompiler.name]
                : [];
        const compilerTransformEditorFields = compilerTransformFields(selectedCompiler);
        const compilerDisplayEditorFields = compilerDisplayFields(selectedCompiler);
        const compilerPropEditorSections = compilerPropSections(selectedCompiler, selectedSceneInterface);
        const compilerEventEditorFields = compilerEventFields(selectedCompiler, selectedSceneInterface);
        const compilerSelection = compilerDocument.selection.type === 'node'
            ? compilerDocument.selection.node
            : undefined;
        const canEditCompilerNode = compilerSelection && selectedCompiler && selectedCompiler.kind !== 'slot' && selectedCompiler.kind !== 'slotOutlet';
        const canEditCompilerSlotOutlet = compilerSelection && selectedCompiler?.kind === 'slotOutlet';
        const commitCompilerSceneName = (value: unknown) => {
            updateCompilerSceneTemplate({ name: typeof value === 'string' ? value : '' });
        };
        const commitCompilerSceneProp = (key: string, value: unknown) => {
            if (typeof value === 'object') {
                return;
            }
            updateCompilerSceneTemplate({
                props: {
                    [key]: value as string | number | boolean | undefined,
                },
            });
        };
        const commitCompilerSceneScriptPath = (value: unknown) => {
            const path = typeof value === 'string' ? value : '';
            updateCompilerSceneTemplate({
                script: path
                    ? {
                        path,
                        className: compilerDocument.descriptor?.className ?? compilerDocument.template.script?.className ?? compilerDocument.template.name,
                    }
                    : undefined,
            });
        };
        const commitCompilerId = (value: unknown) => {
            if (!canEditCompilerNode) {
                return;
            }
            updateCompilerSceneNode(compilerSelection, { id: typeof value === 'string' ? value : '' });
        };
        const commitCompilerProp = (key: string, value: unknown) => {
            if (!canEditCompilerNode || typeof value === 'object') {
                return;
            }
            updateCompilerSceneNode(compilerSelection, {
                props: {
                    [key]: value as string | number | boolean | undefined,
                },
            });
        };
        const commitCompilerEvent = (key: string, value: unknown) => {
            if (!canEditCompilerNode || selectedCompiler?.kind !== 'sceneInstance') {
                return;
            }
            updateCompilerSceneNode(compilerSelection, {
                events: {
                    [key]: typeof value === 'string' ? value : undefined,
                },
            });
        };
        const commitCompilerSlotName = (value: unknown) => {
            if (!canEditCompilerSlotOutlet) {
                return;
            }
            updateCompilerSceneNode(compilerSelection, {
                slotName: typeof value === 'string' ? value : '',
            });
        };
        const openCompilerScript = async () => {
            if (!projectTree) {
                setError('未打开项目。');
                return;
            }
            try {
                await openCompilerSceneScriptFile(projectTree, compilerDocument.template);
                setError(undefined);
            } catch (openError) {
                setError(hostErrorMessage(openError));
            }
        };

        return (
            <div className="panelSurface inspectorSurface" data-testid="compiler-scene-inspector">
                {error ? <div className="errorBox">{error}</div> : null}
                <section className="identity">
                    <span>Compiler Scene</span>
                    <strong>{compilerNodeName(selectedCompiler, compilerDocument.template.name)}</strong>
                    <small>{compilerNodeKind(selectedCompiler)}</small>
                </section>
                <section className="inspectorSection">
                    <h3>Scene</h3>
                    <div className="fieldStack">
                        <EditableFieldRow
                            field={compilerField('name', compilerDocument.template.name)}
                            label="name"
                            onCommit={commitCompilerSceneName}
                        />
                        <EditableFieldRow
                            field={compilerField('width', compilerDocument.template.props.width)}
                            label="width"
                            onCommit={(value) => commitCompilerSceneProp('width', value)}
                        />
                        <EditableFieldRow
                            field={compilerField('height', compilerDocument.template.props.height)}
                            label="height"
                            onCommit={(value) => commitCompilerSceneProp('height', value)}
                        />
                        <EditableFieldRow
                            field={compilerField('script', compilerDocument.template.script?.path)}
                            label="script"
                            onCommit={commitCompilerSceneScriptPath}
                        />
                        <FieldRow label="class" value={compilerDocument.descriptor?.className ?? compilerDocument.template.script?.className} />
                        <FieldRow label="path" value={compilerDocument.scenePath} />
                    </div>
                </section>
                <section className="inspectorSection">
                    <div className="sectionHeader">
                        <h3>Script Binding</h3>
                        <span className={compilerBindingStatus?.ok ? 'bindingState ok' : 'bindingState error'}>
                            {compilerBindingStatus?.message ?? '检查中'}
                        </span>
                    </div>
                    <div className="fieldStack">
                        <FieldRow label="scene" value={compilerBindingStatus?.scenePath ?? compilerDocument.scenePath} />
                        <FieldRow label="contract" value={compilerBindingStatus?.contractScene ?? compilerDocument.descriptor?.scene} />
                        <FieldRow label="script" value={compilerBindingStatus?.scriptPath ?? compilerDocument.template.script?.path} />
                        <FieldRow label="class" value={compilerBindingStatus?.className ?? compilerDocument.template.script?.className} />
                        <div className="inspectorActionRow">
                            <button onClick={openCompilerScript} type="button">打开脚本</button>
                        </div>
                    </div>
                </section>
                <section className="inspectorSection">
                    <h3>Public Contract</h3>
                    <p className="inspectorHint">来自脚本装饰器；.scene 只保存模板和 script 绑定。</p>
                    <div className="fieldStack">
                        <FieldRow label="props" value={`${contractCount(publicInterface, 'props')}: ${contractNames(publicInterface, 'props')}`} />
                        <FieldRow label="events" value={`${contractCount(publicInterface, 'events')}: ${contractNames(publicInterface, 'events')}`} />
                        <FieldRow label="slots" value={`${contractCount(publicInterface, 'slots')}: ${contractNames(publicInterface, 'slots')}`} />
                        <FieldRow label="parts" value={partNames(compilerDocument.descriptor)} />
                    </div>
                </section>
                {selectedCompiler ? (
                    <>
                        <section className="inspectorSection">
                            <h3>Identity</h3>
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
                                        <FieldRow label="kind" value="slot" />
                                        <FieldRow label="name" value={selectedCompiler.name} />
                                        <FieldRow label="owner" value={selectedCompiler.owner} />
                                        <FieldRow label="children" value={selectedCompiler.childCount} />
                                    </>
                                ) : null}
                            </div>
                        </section>
                        {compilerTransformEditorFields.length ? (
                            <section className="inspectorSection">
                                <h3>Transform</h3>
                                <div className="fieldStack">
                                    {compilerTransformEditorFields.map((field) => (
                                        <EditableFieldRow
                                            field={field}
                                            key={field.key}
                                            label={field.label}
                                            onCommit={(value) => commitCompilerProp(field.key, value)}
                                        />
                                    ))}
                                </div>
                            </section>
                        ) : null}
                        {compilerDisplayEditorFields.length ? (
                            <section className="inspectorSection">
                                <h3>Display</h3>
                                <div className="fieldStack">
                                    {compilerDisplayEditorFields.map((field) => (
                                        <EditableFieldRow
                                            field={field}
                                            key={field.key}
                                            label={field.label}
                                            onCommit={(value) => commitCompilerProp(field.key, value)}
                                        />
                                    ))}
                                </div>
                            </section>
                        ) : null}
                        {compilerPropEditorSections.map((section) => (
                            section.fields.length ? (
                                <section className="inspectorSection" key={section.title}>
                                    <h3>{section.title}</h3>
                                    <div className="fieldStack">
                                        {section.fields.map((field) => (
                                            <EditableFieldRow
                                                field={field}
                                                key={field.key}
                                                label={field.label}
                                                onCommit={(value) => commitCompilerProp(field.key, value)}
                                            />
                                        ))}
                                    </div>
                                </section>
                            ) : null
                        ))}
                        {compilerEventEditorFields.length ? (
                            <section className="inspectorSection">
                                <h3>Events</h3>
                                <div className="fieldStack">
                                    {compilerEventEditorFields.map((field) => (
                                        <EditableFieldRow
                                            field={field}
                                            key={`event:${field.key}`}
                                            label={field.label}
                                            onCommit={(value) => commitCompilerEvent(field.key, value)}
                                        />
                                    ))}
                                </div>
                            </section>
                        ) : null}
                        {selectedSlots.length ? (
                            <section className="inspectorSection">
                                <h3>Slots</h3>
                                <div className="fieldStack">
                                    <FieldRow label="slots" value={selectedSlots.join(', ')} />
                                </div>
                            </section>
                        ) : null}
                    </>
                ) : null}
            </div>
        );
    }

    if (!document || !openedScenePath || !selected || !model) {
        return (
            <div className="panelSurface inspectorSurface panelEmptyState">
                <strong>{t('inspectorEmptyTitle')}</strong>
                <span>{t('inspectorEmptyHint')}</span>
            </div>
        );
    }

    const applyCommand = (command: SceneCommand) => {
        const result = document.apply(command, 'manual');
        if (!result.ok) {
            setError(result.error);
            return;
        }
        setError(undefined);
        refreshSceneDocument();
    };

    const commitNodeProp = (prop: 'id' | 'key' | 'role' | 'name', value: unknown) => {
        applyCommand({
            op: 'setNodeProp',
            node: selected,
            prop,
            value: typeof value === 'string' ? value : undefined,
        });
    };

    const commitTransform = (field: InspectorFieldModel, value: unknown) => {
        applyCommand({
            op: 'setTransform',
            node: selected,
            values: {
                [field.key]: value,
            } as Partial<RectTransformSpec>,
        });
    };

    const commitDisplayProp = (field: InspectorFieldModel, value: unknown) => {
        if (model.kind === 'container') {
            return;
        }
        applyCommand({
            op: 'setNodeData',
            node: selected,
            field: model.kind,
            prop: field.key,
            value,
        });
    };

    const commitComponentProp = (component: InspectorComponentModel, field: InspectorFieldModel, value: unknown) => {
        applyCommand({
            op: 'setComponentProp',
            node: selected,
            component: componentLocator(component),
            prop: field.key,
            value,
        });
    };

    const toggleTransformLock = (field: InspectorFieldModel) => {
        const lock = { target: 'transform' as const, node: selected, prop: field.key };
        if (isLocked(document.locks, lock)) {
            document.removeLock(lock);
        } else {
            document.addLock({ ...lock, reason: 'Inspector lock' });
        }
        refreshSceneDocument();
    };

    const toggleDisplayLock = (field: InspectorFieldModel) => {
        if (model.kind === 'container') {
            return;
        }
        const lock = {
            target: 'nodeData' as const,
            node: selected,
            field: model.kind,
            prop: field.key,
        };
        if (isLocked(document.locks, lock)) {
            document.removeLock(lock);
        } else {
            document.addLock({ ...lock, reason: 'Inspector lock' });
        }
        refreshSceneDocument();
    };

    const addComponent = (item: PaletteComponentItem) => {
        const disabledReason = paletteDisabledReason(item, t);
        if (disabledReason) {
            setActionText(disabledReason);
            return;
        }

        const result = document.apply({
            op: 'addComponent',
            node: selected,
            component: createComponentSpecFromSchema(item.schema),
        }, 'manual');

        if (!result.ok) {
            setError(result.error);
            setActionText(result.error);
            return;
        }

        setError(undefined);
        setComponentPickerOpen(false);
        setActionText(t('componentAdded', { name: item.displayName }));
        refreshSceneDocument();
    };

    const addComponentByType = (type: string) => {
        const item = listPaletteComponents({
            scene: document.scene,
            node: selected,
        }).find((candidate) => candidate.type === type);
        if (!item) {
            setActionText(t('droppedFileNotComponent'));
            return;
        }
        addComponent(item);
    };

    const toggleComponentLock = (component: InspectorComponentModel, field: InspectorFieldModel) => {
        const lock = {
            target: 'component' as const,
            node: selected,
            component: componentLocator(component),
            prop: field.key,
        };
        if (isLocked(document.locks, lock)) {
            document.removeLock(lock);
        } else {
            document.addLock({ ...lock, reason: 'Inspector lock' });
        }
        refreshSceneDocument();
    };

    const basicFields = [
        nodePropField('name', model.name, t),
    ];
    const advancedFields = [
        nodePropField('id', model.id, t),
        nodePropField('key', model.key, t),
        nodePropField('role', model.role, t),
    ];

    return (
        <div className="panelSurface inspectorSurface">
            {error ? <div className="errorBox">{error}</div> : null}
            <section className="identity">
                <span>{t('selectedNode')}</span>
                <strong>{model.name ?? model.key ?? model.id}</strong>
                <small>{nodeKindLabel(model.kind, t)}</small>
            </section>
            <section className="inspectorSection">
                <h3>{t('inspectorBasic')}</h3>
                <div className="fieldStack">
                    {basicFields.map((field) => (
                        <EditableFieldRow
                            field={field}
                            key={field.key}
                            label={field.label}
                            onCommit={(value) => commitNodeProp(field.key as 'id' | 'key' | 'role' | 'name', value)}
                        />
                    ))}
                </div>
                <details className="inspectorDetails">
                    <summary>{t('advanced')}</summary>
                    <div className="fieldStack">
                        {advancedFields.map((field) => (
                            <EditableFieldRow
                                field={field}
                                key={field.key}
                                label={field.label}
                                onCommit={(value) => commitNodeProp(field.key as 'id' | 'key' | 'role' | 'name', value)}
                            />
                        ))}
                    </div>
                </details>
            </section>
            <section className="inspectorSection">
                <h3>{t('inspectorLayout')}</h3>
                <div className="fieldGrid four">
                    {model.transform.map((field) => (
                        <EditableFieldRow
                            field={field}
                            key={field.key}
                            label={displayFieldLabel(field, t)}
                            locked={isLocked(document.locks, { target: 'transform', node: selected, prop: field.key })}
                            onCommit={(value) => commitTransform(field, value)}
                            onToggleLock={() => toggleTransformLock(field)}
                            warning={designWarning(document, `${selected}.transform.${field.key}`, field.key, field.value)}
                        />
                    ))}
                </div>
            </section>
            {model.display.map((display) => (
                <section className="inspectorSection" key={display.type}>
                    <h3>{displaySectionTitle(model.kind, t)}</h3>
                    <div className="fieldStack">
                        {display.fields.map((field) => (
                            <EditableFieldRow
                                field={field}
                                key={field.key}
                                label={displayFieldLabel(field, t)}
                                locked={isLocked(document.locks, {
                                    target: 'nodeData',
                                    node: selected,
                                    field: model.kind,
                                    prop: field.key,
                                })}
                                onCommit={(value) => commitDisplayProp(field, value)}
                                onToggleLock={() => toggleDisplayLock(field)}
                                warning={designWarning(document, `${selected}.${model.kind}.${field.key}`, field.key, field.value)}
                            />
                        ))}
                    </div>
                </section>
            ))}
            <section className="inspectorSection addComponentSection">
                <div className="sectionHeader">
                    <h3>{t('inspectorComponents')}</h3>
                    <button onClick={() => setComponentPickerOpen((open) => !open)} type="button">
                        {t('add')}
                    </button>
                </div>
                {model.components.length > 0 ? model.components.map((component) => (
                    <div className="componentCard" key={`${component.id ?? component.type}`}>
                        <h4>{component.displayName}</h4>
                        <div className="fieldStack">
                        {component.fields.map((field) => (
                            <EditableFieldRow
                                actions={document.actions}
                                field={field}
                                key={field.key}
                                label={displayFieldLabel(field, t)}
                                locked={isLocked(document.locks, {
                                    target: 'component',
                                    node: selected,
                                    component: componentLocator(component),
                                    prop: field.key,
                                })}
                                onCommit={(value) => commitComponentProp(component, field, value)}
                                onToggleLock={() => toggleComponentLock(component, field)}
                                warning={designWarning(document, `${selected}.${componentLocator(component)}.${field.key}`, field.key, field.value)}
                            />
                        ))}
                        </div>
                    </div>
                )) : <div className="emptyInline">{t('noComponents')}</div>}
                {componentPickerOpen ? (
                    <div className="componentPicker">
                        {listPaletteComponents({
                            scene: document.scene,
                            node: selected,
                        }).map((item) => {
                            const disabledReason = paletteDisabledReason(item, t);
                            return (
                                <button
                                    disabled={!!disabledReason}
                                    key={item.type}
                                    onClick={() => addComponent(item)}
                                    title={disabledReason ?? item.description ?? item.type}
                                    type="button"
                                >
                                    <strong>{item.displayName}</strong>
                                    <span>{item.type}</span>
                                    <small>{disabledReason ?? item.description ?? item.category}</small>
                                </button>
                            );
                        })}
                    </div>
                ) : null}
                <DropZone
                    acceptedTypes={[editorDragDataTypes.component]}
                    aria-label={t('mountComponentLabel')}
                    className="componentDropZone"
                    onPayloadDrop={(payload) => addComponentByType(payload.data)}
                >
                    {t('componentDropHint')}
                </DropZone>
                <div className="inspectorAction">{actionText}</div>
            </section>
        </div>
    );
}
