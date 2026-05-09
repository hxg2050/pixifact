import { useEffect, useState } from 'react';
import {
    createComponentSpecFromSchema,
    isLocked,
    listPaletteComponents,
    validateDesignTokenValue,
} from 'pixifact';
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
import { parseTextValue, selectedNodeId, useDocumentRevision } from './common';

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
                value={draft.trim() === '' ? undefined : Number(draft)}
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

export function InspectorPanel({ document, model }: { document: SceneDocument; model?: InspectorNodeModel }) {
    useDocumentRevision();
    const t = useI18n();
    const selected = selectedNodeId(document);
    const [error, setError] = useState<string>();
    const [componentPickerOpen, setComponentPickerOpen] = useState(false);
    const [actionText, setActionText] = useState(() => t('inspectorDefaultAction'));

    useEffect(() => {
        setError(undefined);
        setComponentPickerOpen(false);
        setActionText(t('inspectorDefaultAction'));
    }, [selected, t]);

    if (!model) {
        return (
            <div className="panelBody emptyState">
                {t('noNodeSelected')}
            </div>
        );
    }

    if (!selected) {
        return null;
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
                                onCommit={(value) => commitDisplayProp(field, value)}
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
