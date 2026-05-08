import { useEffect, useRef, useState } from 'react';
import type { ComponentSpec, SceneDocument, NodeSpec, SceneSpec } from 'pixifact';
import { ComponentRegistry } from 'pixifact';
import { DragSource, DropZone, TreeView } from '../components/system';
import type { TreeViewItem } from '../components/system';
import { refreshSceneDocument } from '../document/sceneDocumentController';
import { useEditorStore } from '../editorStore';
import { useI18n } from '../i18n';
import {
    basicComponentDragDataType,
    createBasicComponentNode,
    isBasicComponentKind,
} from '../services/basicComponentLibrary';
import { createSceneInstanceNode } from '../services/sceneInstance';
import { hierarchyNodeDragPayload } from '../services/dragPayload';
import { editorDragDataTypes } from '../services/dragPayload';
import { findFileByPath, sceneDragDataType, readProjectFileText } from '../services/projectFileTree';
import { collectHierarchy, getNodeLocator, selectedNodeId, useDocumentRevision } from './common';

interface HierarchyTreeNode {
    depth: number;
    locator: string;
    node: NodeSpec;
}

interface LocatedNode {
    node: NodeSpec;
    parent?: Extract<NodeSpec, { kind: 'container' }>;
    index: number;
}

interface NodeContextMenuState {
    locator: string;
    x: number;
    y: number;
}

type NodeDropPosition = 'before' | 'inside' | 'after';

interface NodeDropTargetState {
    locator: string;
    position: NodeDropPosition;
}

function nodeLabel(node: NodeSpec) {
    return node.name ?? node.key ?? node.id ?? 'Node';
}

function hierarchyTreeItem(node: NodeSpec, depth = 0): TreeViewItem<HierarchyTreeNode> {
    const locator = node.key ?? node.id ?? node.name ?? 'root';
    return {
        children: node.kind === 'container' ? node.children?.map((child) => hierarchyTreeItem(child, depth + 1)) : undefined,
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
        ...(node.kind === 'container' ? (node.children ?? []).flatMap(collectNodeLocators) : []),
    ];
}

function locateNode(node: NodeSpec, locator: string, parent?: Extract<NodeSpec, { kind: 'container' }>, index = 0): LocatedNode | undefined {
    if (node.id === locator || node.key === locator || node.name === locator) {
        return { node, parent, index };
    }

    if (node.kind === 'container') {
        for (let i = 0; i < (node.children?.length ?? 0); i++) {
            const child = node.children![i];
            const found = locateNode(child, locator, node, i);
            if (found) {
                return found;
            }
        }
    }

    return undefined;
}

function collectExistingLocators(node: NodeSpec, locators = new Set<string>()) {
    if (node.id) {
        locators.add(node.id);
    }
    if (node.key) {
        locators.add(node.key);
    }
    for (const component of node.components ?? []) {
        if (component.id) {
            locators.add(component.id);
        }
    }
    if (node.kind === 'container') {
        for (const child of node.children ?? []) {
            collectExistingLocators(child, locators);
        }
    }
    return locators;
}

function nextLocatorValue(base: string, existing: Set<string>) {
    let index = 1;
    let value = `${base}Copy`;
    while (existing.has(value)) {
        index += 1;
        value = `${base}Copy${index}`;
    }
    existing.add(value);
    return value;
}

function mapNodeLocators(node: NodeSpec, existing: Set<string>, idMap: Map<string, string>) {
    if (node.id) {
        idMap.set(node.id, nextLocatorValue(node.id, existing));
    }
    if (node.key) {
        idMap.set(node.key, nextLocatorValue(node.key, existing));
    }
    for (const component of node.components ?? []) {
        if (component.id) {
            idMap.set(component.id, nextLocatorValue(component.id, existing));
        }
    }
    if (node.kind === 'container') {
        for (const child of node.children ?? []) {
            mapNodeLocators(child, existing, idMap);
        }
    }
}

function mapRefValue(value: unknown, idMap: ReadonlyMap<string, string>) {
    if (typeof value === 'string') {
        return idMap.get(value) ?? value;
    }

    if (!value || typeof value !== 'object') {
        return value;
    }

    const ref = value as { node?: string; component?: string };
    if (!ref.node && !ref.component) {
        return structuredClone(value);
    }

    return {
        ...ref,
        node: ref.node ? idMap.get(ref.node) ?? ref.node : undefined,
        component: ref.component ? idMap.get(ref.component) ?? ref.component : undefined,
    };
}

function cloneComponentForPaste(component: ComponentSpec, idMap: ReadonlyMap<string, string>): ComponentSpec {
    const schema = ComponentRegistry.get(component.type);
    const props: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(component.props ?? {})) {
        const prop = schema?.props.find((candidate) => candidate.key === key);
        props[key] = prop?.type === 'componentRef' || prop?.type === 'nodeRef'
            ? mapRefValue(value, idMap)
            : structuredClone(value);
    }

    return {
        ...component,
        id: component.id ? idMap.get(component.id) : undefined,
        props,
    };
}

function cloneNodeForPaste(node: NodeSpec, idMap: ReadonlyMap<string, string>, isRoot = true): NodeSpec {
    const nextName = isRoot && node.name ? `${node.name} 副本` : node.name;
    const cloned = structuredClone(node) as NodeSpec;
    cloned.id = node.id ? idMap.get(node.id) : undefined;
    cloned.key = node.key ? idMap.get(node.key) : undefined;
    cloned.name = nextName;
    cloned.transform = node.transform ? structuredClone(node.transform) : undefined;
    cloned.components = (node.components ?? []).map((component) => cloneComponentForPaste(component, idMap));
    if (cloned.kind === 'container' && node.kind === 'container') {
        cloned.children = (node.children ?? []).map((child) => cloneNodeForPaste(child, idMap, false));
    }
    return cloned;
}

function duplicateNodeForPaste(node: NodeSpec, target: SceneSpec) {
    const existing = collectExistingLocators(target.root);
    const idMap = new Map<string, string>();
    mapNodeLocators(node, existing, idMap);
    return cloneNodeForPaste(node, idMap);
}
function nodeDropPosition(y: number, height: number): NodeDropPosition {
    if (height <= 0) {
        return 'inside';
    }
    const ratio = y / height;
    if (ratio < 0.25) {
        return 'before';
    }
    if (ratio > 0.75) {
        return 'after';
    }
    return 'inside';
}

function isDescendantNode(candidate: NodeSpec, parent: NodeSpec): boolean {
    if (parent.kind === 'container') {
        for (const child of parent.children ?? []) {
            if (child === candidate || isDescendantNode(candidate, child)) {
                return true;
            }
        }
    }
    return false;
}

function canContainChildNode(node: NodeSpec, root: NodeSpec) {
    return node === root || node.kind === 'container';
}

export function HierarchyTree({ document }: { document: SceneDocument }) {
    useDocumentRevision();
    const t = useI18n();
    const projectTree = useEditorStore((state) => state.projectTree);
    const openedScenePath = useEditorStore((state) => state.openedScenePath);
    const items = collectHierarchy(document.scene.root);
    const treeItems = [hierarchyTreeItem(document.scene.root)];
    const expandedKeys = collectNodeLocators(document.scene.root);
    const selected = selectedNodeId(document);
    const selectedItemRef = useRef<HTMLDivElement | null>(null);
    const nodeRowRefs = useRef(new Map<string, HTMLDivElement>());
    const [error, setError] = useState<string>();
    const [dropTarget, setDropTarget] = useState<string>();
    const [nodeDropTarget, setNodeDropTarget] = useState<NodeDropTargetState>();
    const [draggedNodeLocator, setDraggedNodeLocator] = useState<string>();
    const [contextMenu, setContextMenu] = useState<NodeContextMenuState>();
    const [renameTarget, setRenameTarget] = useState<string>();
    const [renameDraft, setRenameDraft] = useState('');
    const [copiedNode, setCopiedNode] = useState<NodeSpec>();
    const contextLocated = contextMenu ? locateNode(document.scene.root, contextMenu.locator) : undefined;
    const isContextRoot = contextLocated?.node === document.scene.root;
    const canPasteIntoContext = Boolean(contextLocated && canContainChildNode(contextLocated.node, document.scene.root));

    useEffect(() => {
        selectedItemRef.current?.scrollIntoView({ block: 'nearest' });
    }, [selected, items]);

    useEffect(() => {
        if (!contextMenu) {
            return;
        }

        const close = () => setContextMenu(undefined);
        window.addEventListener('click', close);
        window.addEventListener('keydown', close);
        return () => {
            window.removeEventListener('click', close);
            window.removeEventListener('keydown', close);
        };
    }, [contextMenu]);

    const applyNodeCommand = (command: Parameters<SceneDocument['apply']>[0], nextSelection?: string) => {
        const result = document.apply(command, 'manual');
        if (!result.ok) {
            setError(result.error);
            return false;
        }
        if (nextSelection) {
            document.setSelection({ type: 'node', node: nextSelection });
        }
        setContextMenu(undefined);
        setNodeDropTarget(undefined);
        setDraggedNodeLocator(undefined);
        setError(undefined);
        refreshSceneDocument();
        return true;
    };

    const beginRenameNode = (located: LocatedNode) => {
        setRenameTarget(getNodeLocator(located.node));
        setRenameDraft(located.node.name ?? '');
        setContextMenu(undefined);
    };

    const commitRenameNode = () => {
        if (!renameTarget) {
            return;
        }
        const located = locateNode(document.scene.root, renameTarget);
        if (!located) {
            setRenameTarget(undefined);
            return;
        }
        const nextName = renameDraft.trim();
        setRenameTarget(undefined);
        if (!nextName || nextName === (located.node.name ?? '')) {
            return;
        }
        applyNodeCommand({
            op: 'setNodeProp',
            node: renameTarget,
            prop: 'name',
            value: nextName,
        }, located.node.key ?? located.node.id ?? nextName);
    };

    const copyNode = (located: LocatedNode) => {
        setCopiedNode(structuredClone(located.node));
        setContextMenu(undefined);
        setError(undefined);
    };

    const pasteNode = (parent: string) => {
        if (!copiedNode) {
            return;
        }
        const locatedParent = locateNode(document.scene.root, parent);
        if (!locatedParent || !canContainChildNode(locatedParent.node, document.scene.root)) {
            setError(t('nodeCannotContainChildren'));
            setContextMenu(undefined);
            return;
        }
        const node = duplicateNodeForPaste(copiedNode, document.scene);
        applyNodeCommand({
            op: 'createNode',
            parent,
            node,
        }, getNodeLocator(node));
    };

    const deleteNode = (located: LocatedNode) => {
        const nextSelection = located.parent ? getNodeLocator(located.parent) : getNodeLocator(document.scene.root);
        applyNodeCommand({
            op: 'deleteNode',
            node: getNodeLocator(located.node),
        }, nextSelection);
    };

    const moveHierarchyNode = (sourceLocator: string, targetLocator: string, position: NodeDropPosition) => {
        const source = locateNode(document.scene.root, sourceLocator);
        const target = locateNode(document.scene.root, targetLocator);
        if (!source || !target || source.node === document.scene.root) {
            return;
        }
        if (source.node === target.node || isDescendantNode(target.node, source.node)) {
            return;
        }

        if (position === 'inside') {
            if (!canContainChildNode(target.node, document.scene.root)) {
                setError(t('nodeCannotContainChildren'));
                setNodeDropTarget(undefined);
                return;
            }
            applyNodeCommand({
                op: 'reparentNode',
                node: sourceLocator,
                parent: targetLocator,
            }, sourceLocator);
            setNodeDropTarget(undefined);
            return;
        }

        const parent = target.parent ?? document.scene.root;
        if (source.parent !== parent && !canContainChildNode(parent, document.scene.root)) {
            setError(t('nodeCannotContainChildren'));
            setNodeDropTarget(undefined);
            return;
        }

        let index = position === 'before' ? target.index : target.index + 1;
        if (source.parent === parent && source.index < index) {
            index -= 1;
        }

        applyNodeCommand({
            op: 'reparentNode',
            node: sourceLocator,
            parent: getNodeLocator(parent),
            index,
        }, sourceLocator);
        setNodeDropTarget(undefined);
    };

    const addBasicComponentUnderNode = (kind: string, parent: string) => {
        if (!isBasicComponentKind(kind)) {
            setError(t('basicComponentMissing'));
            return;
        }
        const locatedParent = locateNode(document.scene.root, parent);
        if (!locatedParent || !canContainChildNode(locatedParent.node, document.scene.root)) {
            setError(t('nodeCannotContainChildren'));
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
        refreshSceneDocument();
    };

    const addSceneUnderNode = async (scenePath: string, parent: string) => {
        if (scenePath === openedScenePath) {
            setError(t('sceneCannotDropSelf'));
            return;
        }

        const file = projectTree ? findFileByPath(projectTree, scenePath) : undefined;
        if (!projectTree || !file || file.kind !== 'scene') {
            setError(t('droppedFileNotScene'));
            return;
        }
        const locatedParent = locateNode(document.scene.root, parent);
        if (!locatedParent || !canContainChildNode(locatedParent.node, document.scene.root)) {
            setError(t('nodeCannotContainChildren'));
            return;
        }

        const source = JSON.parse(await readProjectFileText(projectTree, file)) as SceneSpec;
        const node = createSceneInstanceNode(source, document.scene);
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
        refreshSceneDocument();
    };

    return (
        <div className="nodeTree" data-testid="hierarchy-tree">
            <div className="sectionHeader hierarchyHeader">
                <div className="sectionTitle">{t('hierarchyTreeTitle')}</div>
                <small>{t('hierarchyDropHint')}</small>
            </div>
            {error ? <div className="errorBox">{error}</div> : null}
            <TreeView
                ariaLabel={t('sceneNodeTreeLabel')}
                expandedKeys={expandedKeys}
                items={treeItems}
                onItemAction={(item) => document.setSelection({ type: 'node', node: item.locator })}
                onSelectedKeyChange={(_, item) => document.setSelection({ type: 'node', node: item.locator })}
                selectedKeys={selected ? [selected] : []}
                renderItem={({ item }) => (
                    <DropZone
                        acceptedTypes={[sceneDragDataType, basicComponentDragDataType, editorDragDataTypes.hierarchyNode]}
                        aria-label={t('dropToNode', { node: nodeLabel(item.node) })}
                        className={[
                            'nodeRow',
                            item.locator === selected ? 'selected' : '',
                            item.locator === dropTarget ? 'dropTarget' : '',
                            nodeDropTarget?.locator === item.locator ? `nodeDropTarget ${nodeDropTarget.position}` : '',
                        ].filter(Boolean).join(' ')}
                        getDropOperation={(types, allowedOperations) => {
                            if (types.has(editorDragDataTypes.hierarchyNode)) {
                                return allowedOperations.includes('move') ? 'move' : 'cancel';
                            }
                            if (!canContainChildNode(item.node, document.scene.root)) {
                                return 'cancel';
                            }
                            return allowedOperations.includes('copy') ? 'copy' : allowedOperations[0] ?? 'copy';
                        }}
                        onDropEnter={() => setDropTarget(item.locator)}
                        onDropExit={() => setDropTarget((target) => target === item.locator ? undefined : target)}
                        onDropMove={(event) => {
                            setDropTarget(item.locator);
                            if (draggedNodeLocator) {
                                const height = nodeRowRefs.current.get(item.locator)?.getBoundingClientRect().height ?? 26;
                                const position = nodeDropPosition(event.y, height);
                                setNodeDropTarget({
                                    locator: item.locator,
                                    position: position === 'inside' && !canContainChildNode(item.node, document.scene.root)
                                        ? event.y < height / 2 ? 'before' : 'after'
                                        : position,
                                });
                            }
                        }}
                        onPayloadDrop={(payload) => {
                            setDropTarget(item.locator);
                            if (payload.type === editorDragDataTypes.hierarchyNode) {
                                moveHierarchyNode(payload.data, item.locator, nodeDropTarget?.locator === item.locator ? nodeDropTarget.position : 'inside');
                                return;
                            }
                            setNodeDropTarget(undefined);
                            if (payload.type === sceneDragDataType) {
                                void addSceneUnderNode(payload.data, item.locator);
                                return;
                            }
                            addBasicComponentUnderNode(payload.data, item.locator);
                        }}
                        ref={(element) => {
                            if (element) {
                                nodeRowRefs.current.set(item.locator, element);
                            } else {
                                nodeRowRefs.current.delete(item.locator);
                            }
                            if (item.locator === selected) {
                                selectedItemRef.current = element;
                            }
                        }}
                        style={{ '--tree-indent': `${item.depth * 14}px` } as React.CSSProperties}
                        onContextMenu={(event) => {
                            event.preventDefault();
                            document.setSelection({ type: 'node', node: item.locator });
                            setContextMenu({
                                locator: item.locator,
                                x: event.clientX,
                                y: event.clientY,
                            });
                        }}
                    >
                        <DragSource
                            as="div"
                            className="nodeDragContent"
                            disabled={item.node === document.scene.root || renameTarget === item.locator}
                            getAllowedDropOperations={() => ['move']}
                            onSystemDragEnd={() => {
                                setDraggedNodeLocator(undefined);
                                setNodeDropTarget(undefined);
                            }}
                            onSystemDragStart={() => setDraggedNodeLocator(item.locator)}
                            payload={hierarchyNodeDragPayload(item.locator, nodeLabel(item.node))}
                        >
                            {renameTarget === item.locator ? (
                                <input
                                    aria-label={t('renameNodeLabel')}
                                    autoFocus
                                    className="inlineRenameInput"
                                    data-testid="inline-rename-node"
                                    onBlur={commitRenameNode}
                                    onChange={(event) => setRenameDraft(event.target.value)}
                                    onClick={(event) => event.stopPropagation()}
                                    onKeyDown={(event) => {
                                        event.stopPropagation();
                                        if (event.key === 'Enter') {
                                            event.currentTarget.blur();
                                        }
                                        if (event.key === 'Escape') {
                                            setRenameTarget(undefined);
                                        }
                                    }}
                                    value={renameDraft}
                                />
                            ) : (
                                <strong>{nodeLabel(item.node)}</strong>
                            )}
                            <small>{item.node.role ?? item.locator}</small>
                        </DragSource>
                    </DropZone>
                )}
            />
            {contextMenu && contextLocated ? (
                <div
                    className="nodeContextMenu"
                    data-testid="node-context-menu"
                    onClick={(event) => event.stopPropagation()}
                    onContextMenu={(event) => event.preventDefault()}
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                    <button data-testid="node-menu-rename" onClick={() => beginRenameNode(contextLocated)} type="button">
                        {t('rename')}
                    </button>
                    <button data-testid="node-menu-copy" onClick={() => copyNode(contextLocated)} type="button">
                        {t('copy')}
                    </button>
                    <button data-testid="node-menu-paste" disabled={!copiedNode || !canPasteIntoContext} onClick={() => pasteNode(contextMenu.locator)} type="button">
                        {t('paste')}
                    </button>
                    <button data-testid="node-menu-delete" disabled={isContextRoot} onClick={() => deleteNode(contextLocated)} type="button">
                        {t('delete')}
                    </button>
                </div>
            ) : null}
        </div>
    );
}

export function HierarchyPanel({ document }: { document: SceneDocument }) {
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
