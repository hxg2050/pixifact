import { useEffect, useRef, useState } from 'react';
import type { EditorDocument, NodeSpec, PrefabSpec } from '../../../../src';
import { DropZone, TreeView } from '../components/system';
import type { TreeViewItem } from '../components/system';
import { refreshEditorDocument } from '../document/editorDocumentController';
import { useEditorStore } from '../editorStore';
import {
    basicComponentDragDataType,
    createBasicComponentNode,
    isBasicComponentKind,
} from '../services/basicComponentLibrary';
import { createPrefabInstanceNode } from '../services/prefabInstance';
import { findFileByPath, prefabDragDataType } from '../services/projectFileTree';
import { collectHierarchy, selectedNodeId, useDocumentRevision } from './common';

async function readPrefabSpec(handle: FileSystemFileHandle): Promise<PrefabSpec> {
    return JSON.parse(await (await handle.getFile()).text()) as PrefabSpec;
}

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
            setError('拖入的基础组件不存在。');
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
            setError('不能把当前正在编辑的 Prefab 拖入自身。');
            return;
        }

        const file = projectTree ? findFileByPath(projectTree, prefabPath) : undefined;
        if (!file || file.kind !== 'prefab') {
            setError('拖入的文件不是 Prefab。');
            return;
        }

        const source = await readPrefabSpec(file.handle as FileSystemFileHandle);
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
                <div className="sectionTitle">节点树</div>
                <small>拖入基础组件或 Prefab</small>
            </div>
            {error ? <div className="errorBox">{error}</div> : null}
            <TreeView
                ariaLabel="预制体节点树"
                expandedKeys={expandedKeys}
                items={treeItems}
                onItemAction={(item) => document.setSelection({ type: 'node', node: item.locator })}
                onSelectedKeyChange={(_, item) => document.setSelection({ type: 'node', node: item.locator })}
                selectedKeys={selected ? [selected] : []}
                renderItem={({ item }) => (
                    <DropZone
                        acceptedTypes={[prefabDragDataType, basicComponentDragDataType]}
                        aria-label={`拖放到 ${nodeLabel(item.node)}`}
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
    return (
        <aside className="panel leftPanel" aria-label="层级">
            <header className="panelHeader">
                <h2>层级</h2>
            </header>
            <HierarchyTree document={document} />
        </aside>
    );
}
