import { useEffect, useState } from 'react';
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
import { pairedSceneScriptPath, resolveSceneReference } from '../../../../packages/pixifact/src/compiler/sceneAssetPair';
import type {
    InspectorFieldModel,
} from 'pixifact';
import {
    Checkbox,
    DropZone,
    NumberField,
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
        const binding = await readCompilerSceneBinding(projectTree, sceneFile);
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

function fieldRowClassName(field: InspectorFieldModel) {
    return field.key === 'text' || field.key === 'src' || field.key === 'texture'
        ? 'editableFieldRow editableFieldRow--wide'
        : 'editableFieldRow';
}

interface EditableFieldRowProps {
    label: string;
    field: InspectorFieldModel;
    warning?: string;
    locked?: boolean;
    onCommit(value: unknown): void;
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

    const row = (
        <div className={[fieldRowClassName(field), warning ? 'warning' : ''].filter(Boolean).join(' ')}>
            <label>
                <span>{label}</span>
                <div data-field-key={field.key}>{control}</div>
            </label>
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

export function InspectorPanel() {
    useCompilerSceneRevision();
    const t = useI18n();
    const openedScenePath = useEditorStore((state) => state.openedScenePath);
    const projectTree = useEditorStore((state) => state.projectTree);
    const compilerDocument = getCompilerSceneDocument();
    const [error, setError] = useState<string>();
    const [compilerBindingStatus, setCompilerBindingStatus] = useState<CompilerSceneBindingStatus>();

    useEffect(() => {
        setError(undefined);
    }, [openedScenePath, compilerDocument?.selection]);

    useEffect(() => {
        if (!openedScenePath || !compilerDocument || compilerDocument.scenePath !== openedScenePath) {
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
        compilerDocument,
        openedScenePath,
        projectTree,
        t,
        compilerDocument?.scenePath,
        compilerDocument?.descriptor?.scene,
        compilerDocument?.descriptor?.className,
    ]);

    if (openedScenePath && compilerDocument?.scenePath === openedScenePath) {
        const publicInterface = compilerDocument.descriptor?.interface ?? compilerDocument.template.interface;
        const selectedCompiler = compilerDocument.selection.type === 'node'
            ? selectedCompilerSlot(compilerDocument.template.children, compilerDocument.selection.node) ?? selectedCompilerNode(compilerDocument.template.children, compilerDocument.selection.node)
            : undefined;
        const selectedSceneInterface = compilerSceneInterfaceForInstance(compilerDocument, selectedCompiler);
        const selectedSlotRows = compilerSceneInstanceSlotRows(selectedCompiler, selectedSceneInterface);
        const compilerTransformEditorFields = compilerTransformFields(selectedCompiler);
        const compilerDisplayEditorFields = compilerDisplayFields(selectedCompiler);
        const compilerPropEditorSections = compilerPropSections(selectedCompiler, selectedSceneInterface);
        const compilerEventEditorFields = compilerEventFields(selectedCompiler, selectedSceneInterface);
        const compilerSelection = compilerDocument.selection.type === 'node'
            ? compilerDocument.selection.node
            : undefined;
        const sceneSelected = !selectedCompiler;
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
                                onCommit={(value) => commitCompilerSceneProp('width', value)}
                            />
                            <EditableFieldRow
                                field={compilerField('height', compilerDocument.template.props.height)}
                                label="height"
                                onCommit={(value) => commitCompilerSceneProp('height', value)}
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
                                            onCommit={(value) => commitCompilerProp(field.key, value)}
                                        />
                                    ))}
                                </div>
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
                                            onCommit={(value) => commitCompilerProp(field.key, value)}
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
                                                onCommit={(value) => commitCompilerProp(field.key, value)}
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
                                            onCommit={(value) => commitCompilerEvent(field.key, value)}
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
