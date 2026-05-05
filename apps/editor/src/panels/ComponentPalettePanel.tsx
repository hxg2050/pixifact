import { useEffect, useState } from 'react';
import {
    createComponentSpecFromSchema,
    listPaletteComponents,
} from '../../../../src';
import type { EditorDocument, PaletteComponentItem } from '../../../../src';
import { Icon } from '../components/IconButton';
import { refreshEditorDocument } from '../document/editorDocumentController';
import { FieldRow, selectedNodeId } from './common';

function paletteDisabledReason(item: PaletteComponentItem, selected?: string) {
    if (!selected) {
        return '请先选择节点。';
    }
    return item.disabledReason
        ? item.disabledReason.replace('already exists on this node.', '已在当前节点上存在。')
        : undefined;
}

export function ComponentPalettePanel({ document }: { document: EditorDocument }) {
    const selected = selectedNodeId(document);
    const items = listPaletteComponents({
        prefab: document.prefab,
        node: selected,
    });
    const [error, setError] = useState<string>();

    useEffect(() => {
        setError(undefined);
    }, [selected]);

    const addComponent = (item: PaletteComponentItem) => {
        if (!selected) {
            setError('请先选择要添加组件的节点。');
            return;
        }

        const result = document.apply({
            op: 'addComponent',
            node: selected,
            component: createComponentSpecFromSchema(item.schema),
        }, 'manual');

        if (!result.ok) {
            setError(result.error);
            return;
        }

        setError(undefined);
        refreshEditorDocument();
    };

    return (
        <div className="panelBody">
            <section className="inspectorSection">
                <h3>当前节点</h3>
                {selected ? (
                    <FieldRow label="节点" value={selected} />
                ) : (
                    <div className="emptyInline">请在左侧层级中选择节点，再添加组件。</div>
                )}
                {error ? <div className="errorBox">{error}</div> : null}
            </section>
            <section className="inspectorSection">
                <h3>组件库</h3>
                <div className="paletteList">
                    {items.map((item) => {
                        const disabledReason = paletteDisabledReason(item, selected);
                        return (
                            <button
                                className="paletteItem"
                                disabled={!!disabledReason}
                                key={item.type}
                                onClick={() => addComponent(item)}
                                title={disabledReason ?? item.description ?? item.type}
                                type="button"
                            >
                                <span>{item.category}</span>
                                <strong>{item.displayName}</strong>
                                <small>{disabledReason ?? item.description ?? item.type}</small>
                                {!disabledReason ? (
                                    <span className="paletteAddIcon" aria-hidden="true">
                                        <Icon name="plus" />
                                    </span>
                                ) : null}
                            </button>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}
