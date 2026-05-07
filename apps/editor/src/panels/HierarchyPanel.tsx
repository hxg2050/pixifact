import { useEffect, useRef, useState } from 'react';
import type { EditorDocument, NodeSpec, PrefabSpec } from '../../../../src';
import { DropZone, TreeView } from '../components/system';
import type { TreeViewItem } from '../components/system';
import { refreshEditorDocument } from '../document/editorDocumentController';
import { useEditorStore } from '../editorStore';
import { useI18n } from '../i18n';
import {
    basicComponentDragDataType,
    createBasicComponentNode,
    isBasicComponentKind,
} from '../services/basicComponentLibrary';
import { createPrefabInstanceNode } from '../services/prefabInstance';
import { findFileByPath, prefabDragDataType, readProjectFileText } from '../services/projectFileTree';
import { collectHierarchy, selectedNodeId, useDocumentRevision } from './common';

interface HierarchyTreeNode {
    depth: number;
    locator: string;
    node: NodeSpec;
}

function nodeLabel(node: NodeSpec) {
    return node.name ?? node.key ?? node.id ?? 'Node';
}

function hierarchyTreeItem(node: NodeSpec, depth = 0): TreeViewItem<HierarchyTreeNode> {
    const locator = node.key ?? node.id ?? node.name ?? 'root';
    return {
        children: node.children?.map((child) => hierarchyTreeItem(child, depth + 1)),
        id: locator,
        item: {
            depth,
            locator,
            node,
        },
        textValue: nodeLabel(node),
    };
}

function collectNodeLocators(node: NodeSpec): string[] {
    const locator = node.key ?? node.id ?? node.name ?? 'root';
    return [
        locator,
        ...(node.children ?? []).flatMap(collectNodeLocators),
    ];
}

export function HierarchyTree({ document }: { document: EditorDocument }) {
    useDocumentRevision();
    const t = useI18n();
    const projectTree = useEditorStore((state) => state.projectTree);
    const openedPrefabPath = useEditorStore((state) => state.openedPrefabPath);
    const items = collectHierarchy(document.prefab.root);
    const treeItems = [hierarchyTreeItem(document.prefab.root)];
    const expandedKeys = collectNodeLocators(document.prefab.root);
    const selected = selectedNodeId(document);
    const selectedItemRef = useRef<HTMLDivElement | null>(null);
    const [error, setError] = useState<string>();
    const [dropTarget, setDropTarget] = useState<string>();

    useEffect(() => {
        selectedItemRef.current?.scrollIntoView({ block: 'nearest' });
    }, [selected, items]);

    const addBasicComponentUnderNode = (kind: string, parent: string) => {
        if (!isBasicComponentKind(kind)) {
            setError(t('basicComponentMissing'));
            return;
        }

        const node = createBasicComponentNode(document, kind);
        const result = document.apply({
            op: 'createNode',
            parent,
            node,
        }, 'manual');
        if (!result.ok) {
            setError(result.error);
            return;
        }
        document.setSelection({ type: 'node', node: node.key ?? node.name ?? '' });
        setDropTarget(undefined);
        setError(undefined);
        refreshEditorDocument();
    };

    const addPrefabUnderNode = async (prefabPath: string, parent: string) => {
        if (prefabPath === openedPrefabPath) {
            setError(t('prefabCannotDropSelf'));
            return;
        }

        const file = projectTree ? findFileByPath(projectTree, prefabPath) : undefined;
        if (!projectTree || !file || file.kind !== 'prefab') {
            setError(t('droppedFileNotPrefab'));
            return;
        }

        const source = JSON.parse(await readProjectFileText(projectTree, file)) as PrefabSpec;
        const node = createPrefabInstanceNode(source, document.prefab);
        const result = document.apply({
            op: 'createNode',
            parent,
            node,
        }, 'manual');

        if (!result.ok) {
            setError(result.error);
            return;
        }

        document.setSelection({ type: 'node', node: node.key ?? node.id ?? node.name ?? '' });
        setDropTarget(undefined);
        setError(undefined);
        refreshEditorDocument();
    };

    return (
        <div className="nodeTree" data-testid="hierarchy-tree">
            <div className="sectionHeader hierarchyHeader">
                <div className="sectionTitle">{t('hierarchyTreeTitle')}</div>
                <small>{t('hierarchyDropHint')}</small>
            </div>
            {error ? <div className="errorBox">{error}</div> : null}
            <TreeView
                ariaLabel={t('prefabNodeTreeLabel')}
                expandedKeys={expandedKeys}
                items={treeItems}
                onItemAction={(item) => document.setSelection({ type: 'node', node: item.locator })}
                onSelectedKeyChange={(_, item) => document.setSelection({ type: 'node', node: item.locator })}
                selectedKeys={selected ? [selected] : []}
                renderItem={({ item }) => (
                    <DropZone
                        acceptedTypes={[prefabDragDataType, basicComponentDragDataType]}
                        aria-label={t('dropToNode', { node: nodeLabel(item.node) })}
                        className={[
                            'nodeRow',
                            item.locator === selected ? 'selected' : '',
                            item.locator === dropTarget ? 'dropTarget' : '',
                        ].filter(Boolean).join(' ')}
                        onDropEnter={() => setDropTarget(item.locator)}
                        onDropExit={() => setDropTarget((target) => target === item.locator ? undefined : target)}
                        onPayloadDrop={(payload) => {
                            setDropTarget(item.locator);
                            if (payload.type === prefabDragDataType) {
                                void addPrefabUnderNode(payload.data, item.locator);
                                return;
                            }
                            addBasicComponentUnderNode(payload.data, item.locator);
                        }}
                        ref={item.locator === selected ? selectedItemRef : undefined}
                        style={{ '--tree-indent': `${item.depth * 14}px` } as React.CSSProperties}
                    >
                        <strong>{nodeLabel(item.node)}</strong>
                        <small>{item.node.role ?? item.locator}</small>
                    </DropZone>
                )}
            />
        </div>
    );
}

export function HierarchyPanel({ document }: { document: EditorDocument }) {
    const t = useI18n();

    return (
        <aside className="panel leftPanel" aria-label={t('hierarchyLabel')}>
            <header className="panelHeader">
                <h2>{t('hierarchyLabel')}</h2>
            </header>
            <HierarchyTree document={document} />
        </aside>
    );
}
