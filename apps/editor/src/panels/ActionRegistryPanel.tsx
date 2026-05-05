import { useState } from 'react';
import type { EditorDocument } from '../../../../src';
import { ActionButton } from '../components/ActionButton';
import { IconButton } from '../components/IconButton';
import { refreshEditorDocument } from '../document/editorDocumentController';
import { parseTextValue } from './common';

function actionSourceLabel(source: string | undefined) {
    switch (source) {
        case 'ai':
            return 'AI';
        case 'code':
            return '代码';
        default:
            return '手动';
    }
}

export function ActionRegistryPanel({ document }: { document: EditorDocument }) {
    const [key, setKey] = useState('');
    const [label, setLabel] = useState('');
    const [description, setDescription] = useState('');
    const [error, setError] = useState<string>();
    const canSave = key.trim().length > 0;

    const clearDraft = () => {
        setKey('');
        setLabel('');
        setDescription('');
    };

    const saveAction = () => {
        const normalizedKey = key.trim();
        if (!normalizedKey) {
            setError('动作键不能为空。');
            return;
        }
        if (!/^[A-Za-z][A-Za-z0-9:_-]*$/.test(normalizedKey)) {
            setError('动作键必须以字母开头，只能包含字母、数字、冒号、下划线或短横线。');
            return;
        }

        document.addAction({
            key: normalizedKey,
            label: parseTextValue(label),
            description: parseTextValue(description),
            source: 'manual',
        });
        document.dirty = true;
        clearDraft();
        setError(undefined);
        refreshEditorDocument();
    };

    const editAction = (action: { key: string; label?: string; description?: string }) => {
        setKey(action.key);
        setLabel(action.label ?? '');
        setDescription(action.description ?? '');
        setError(undefined);
    };

    const deleteAction = (actionKey: string) => {
        document.removeAction(actionKey);
        setError(undefined);
        refreshEditorDocument();
    };

    return (
        <div className="panelBody">
            <section className="inspectorSection">
                <h3>{document.actions.some((action) => action.key === key.trim()) ? '编辑动作' : '新增动作'}</h3>
                <div className="formStack">
                    <label>
                        <span>动作键</span>
                        <input
                            onChange={(event) => {
                                setKey(event.target.value);
                                setError(undefined);
                            }}
                            placeholder="useInventoryItem"
                            value={key}
                        />
                    </label>
                    <label>
                        <span>名称</span>
                        <input onChange={(event) => setLabel(event.target.value)} value={label} />
                    </label>
                    <label>
                        <span>描述</span>
                        <textarea onChange={(event) => setDescription(event.target.value)} value={description} />
                    </label>
                </div>
                <div className="buttonRow">
                    <ActionButton icon="check" label="保存动作" variant="primary" data-testid="action-save" onClick={saveAction} disabled={!canSave} />
                    <ActionButton icon="trash" label="清空" onClick={clearDraft} disabled={!key && !label && !description} />
                </div>
                {error ? <div className="errorBox">{error}</div> : null}
            </section>
            <section className="inspectorSection">
                <h3>动作注册表</h3>
                {document.actions.length > 0 ? (
                    <div className="actionList">
                        {document.actions.map((action) => (
                            <div className="actionItem" key={action.key}>
                                <span>{actionSourceLabel(action.source)}</span>
                                <strong>{action.label ?? action.key}</strong>
                                <small>{action.description ? `${action.key} - ${action.description}` : action.key}</small>
                                <div className="actionButtons">
                                    <IconButton icon="edit" label="编辑动作" onClick={() => editAction(action)} />
                                    <IconButton icon="trash" label="删除动作" onClick={() => deleteAction(action.key)} />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="emptyInline">暂无动作</div>
                )}
            </section>
        </div>
    );
}
