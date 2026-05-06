import { useEffect, useState } from 'react';
import {
    createComponentSpecFromSchema,
    isLocked,
    listPaletteComponents,
    validateDesignTokenValue,
} from '../../../../src';
import type {
    EditorCommand,
    EditorDocument,
    InspectorComponentModel,
    InspectorFieldModel,
    InspectorNodeModel,
    PaletteComponentItem,
    RectTransformSpec,
} from '../../../../src';
import { IconButton } from '../components/IconButton';
import {
    Checkbox,
    DropZone,
    NumberField,
    Select,
    TextField,
} from '../components/system';
import { refreshEditorDocument } from '../document/editorDocumentController';
import { editorDragDataTypes } from '../services/dragPayload';
import { FieldRow, parseTextValue, selectedNodeId, useDocumentRevision } from './common';

const nodePropLabels: Record<'id' | 'key' | 'role' | 'name', string> = {
    id: 'ID',
    key: 'Key',
    role: '角色',
    name: '名称',
};

const fieldLabels: Record<string, string> = {
    x: 'X',
    y: 'Y',
    width: '宽度',
    height: '高度',
    anchorX: '锚点 X',
    anchorY: '锚点 Y',
    scaleX: '缩放 X',
    scaleY: '缩放 Y',
    rotation: '旋转',
    raycastTarget: '接收点击',
    color: '颜色',
    fillAlpha: '填充透明度',
    radius: '圆角',
    strokeColor: '描边颜色',
    strokeWidth: '描边宽度',
    strokeAlpha: '描边透明度',
    text: '文本',
    fontSize: '字号',
    fontFamily: '字体',
    fontWeight: '字重',
    center: '居中',
    onClick: '点击动作',
    interactable: '可交互',
    targetGraphic: '目标图形',
    transition: '过渡',
    normalColor: '默认颜色',
    highlightedColor: '悬停颜色',
    pressedColor: '按下颜色',
    disabledColor: '禁用颜色',
    pressedScale: '按下缩放',
    value: '值',
    min: '最小值',
    max: '最大值',
    fillNode: '填充节点',
    fillGraphic: '填充图形',
    placeholder: '占位文本',
    multiline: '多行',
    textGraphic: '文本图形',
    viewport: '视口节点',
    content: '内容节点',
    contentHeight: '内容高度',
    wheelSensitivity: '滚轮灵敏度',
    dragEnabled: '允许拖拽',
};

function displayFieldLabel(field: InspectorFieldModel) {
    return fieldLabels[field.key] ?? field.label;
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
                    { label: '未设置', value: '' },
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
                    { label: '未绑定', value: '' },
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
                    label={locked ? '解锁字段' : '锁定字段'}
                    onClick={onToggleLock}
                />
            ) : null}
            {warning ? <small>{warning}</small> : null}
        </div>
    );
}

function nodePropField(key: 'id' | 'key' | 'role' | 'name', value: unknown): InspectorFieldModel {
    return {
        key,
        label: nodePropLabels[key],
        type: 'string',
        value,
    };
}

function designWarning(document: EditorDocument, target: string, prop: string, value: unknown) {
    return validateDesignTokenValue(document.designTokens, target, prop, value)?.message;
}

function paletteDisabledReason(item: PaletteComponentItem, selected: string) {
    return item.disabledReason
        ? item.disabledReason.replace('already exists on this node.', '已在当前节点上存在。')
        : undefined;
}

export function InspectorPanel({ document, model }: { document: EditorDocument; model?: InspectorNodeModel }) {
    useDocumentRevision();
    const selected = selectedNodeId(document);
    const [error, setError] = useState<string>();
    const [componentPickerOpen, setComponentPickerOpen] = useState(false);
    const [actionText, setActionText] = useState('可点击添加 Component，或从文件面板拖动 Component 到 Inspector 空白区域。');

    useEffect(() => {
        setError(undefined);
        setComponentPickerOpen(false);
        setActionText('可点击添加 Component，或从文件面板拖动 Component 到 Inspector 空白区域。');
    }, [selected]);

    if (!model) {
        return (
            <div className="panelBody emptyState">
                未选择节点
            </div>
        );
    }

    if (!selected) {
        return null;
    }

    const applyCommand = (command: EditorCommand) => {
        const result = document.apply(command, 'manual');
        if (!result.ok) {
            setError(result.error);
            return;
        }
        setError(undefined);
        refreshEditorDocument();
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
        refreshEditorDocument();
    };

    const addComponent = (item: PaletteComponentItem) => {
        const disabledReason = paletteDisabledReason(item, selected);
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
        setActionText(`已添加 ${item.displayName} 到当前节点。`);
        refreshEditorDocument();
    };

    const addComponentByType = (type: string) => {
        const item = listPaletteComponents({
            prefab: document.prefab,
            node: selected,
        }).find((candidate) => candidate.type === type);
        if (!item) {
            setActionText('拖入的文件不是可挂载 Component。');
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
        refreshEditorDocument();
    };

    const nodeFields = [
        nodePropField('name', model.name),
        nodePropField('id', model.id),
        nodePropField('key', model.key),
        nodePropField('role', model.role),
    ];

    return (
        <div className="panelSurface inspectorSurface">
            {error ? <div className="errorBox">{error}</div> : null}
            <section className="identity">
                <span>选中节点</span>
                <strong>{model.name ?? model.key ?? model.id}</strong>
                <small>{model.id ?? model.key ?? selected}</small>
            </section>
            <section className="inspectorSection">
                <h3>Identity</h3>
                <div className="fieldStack">
                    {nodeFields.map((field) => (
                        <EditableFieldRow
                            field={field}
                            key={field.key}
                            label={field.label}
                            onCommit={(value) => commitNodeProp(field.key as 'id' | 'key' | 'role' | 'name', value)}
                        />
                    ))}
                </div>
            </section>
            <section className="inspectorSection">
                <h3>Transform</h3>
                <div className="fieldGrid four">
                    {model.transform.map((field) => (
                        <EditableFieldRow
                            field={field}
                            key={field.key}
                            label={displayFieldLabel(field)}
                            locked={isLocked(document.locks, { target: 'transform', node: selected, prop: field.key })}
                            onCommit={(value) => commitTransform(field, value)}
                            onToggleLock={() => toggleTransformLock(field)}
                            warning={designWarning(document, `${selected}.transform.${field.key}`, field.key, field.value)}
                        />
                    ))}
                </div>
            </section>
            {model.components.map((component) => (
                <section className="inspectorSection" key={`${component.id ?? component.type}`}>
                    <h3>{component.displayName}</h3>
                    <div className="fieldStack">
                        <FieldRow label="Type" value={component.type} />
                        <FieldRow label="组件 ID" value={component.id} />
                        {component.fields.map((field) => (
                            <EditableFieldRow
                                actions={document.actions}
                                field={field}
                                key={field.key}
                                label={displayFieldLabel(field)}
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
                </section>
            ))}
            <section className="inspectorSection addComponentSection">
                <div className="sectionHeader">
                    <h3>Components</h3>
                    <button onClick={() => setComponentPickerOpen((open) => !open)} type="button">
                        添加
                    </button>
                </div>
                {componentPickerOpen ? (
                    <div className="componentPicker">
                        {listPaletteComponents({
                            prefab: document.prefab,
                            node: selected,
                        }).map((item) => {
                            const disabledReason = paletteDisabledReason(item, selected);
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
                    aria-label="挂载 Component"
                    className="componentDropZone"
                    onPayloadDrop={(payload) => addComponentByType(payload.data)}
                >
                    从文件面板拖动 Component 到这里，或点击添加从项目 Component 列表选择。
                </DropZone>
                <div className="inspectorAction">{actionText}</div>
            </section>
        </div>
    );
}
