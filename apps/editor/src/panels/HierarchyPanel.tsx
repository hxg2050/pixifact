import { useEffect, useRef } from 'react';
import type { EditorDocument } from '../../../../src';
import { collectHierarchy, selectedNodeId } from './common';

export function HierarchyTree({ document }: { document: EditorDocument }) {
    const items = collectHierarchy(document.prefab.root);
    const selected = selectedNodeId(document);
    const selectedItemRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        selectedItemRef.current?.scrollIntoView({ block: 'nearest' });
    }, [selected, items]);

    return (
        <div className="treeList" data-testid="hierarchy-tree">
            {items.map((item) => (
                <button
                    className={item.locator === selected ? 'treeItem selected' : 'treeItem'}
                    key={item.locator}
                    onClick={() => document.setSelection({ type: 'node', node: item.locator })}
                    ref={item.locator === selected ? selectedItemRef : undefined}
                    style={{ paddingLeft: 12 + item.depth * 16 }}
                    type="button"
                >
                    <span>{item.node.name ?? item.node.key ?? item.node.id}</span>
                    <small>{item.node.role ?? item.locator}</small>
                </button>
            ))}
        </div>
    );
}

export function HierarchyPanel({ document }: { document: EditorDocument }) {
    return (
        <aside className="panel leftPanel" aria-label="层级">
            <header className="panelHeader">
                <h2>层级</h2>
            </header>
            <HierarchyTree document={document} />
        </aside>
    );
}
