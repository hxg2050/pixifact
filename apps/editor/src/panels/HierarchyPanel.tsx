import { useEffect, useRef, useState } from 'react';
import type { ComponentSpec, SceneDocument, NodeSpec, SceneSpec } from 'pixifact';
import { ComponentRegistry } from 'pixifact';
import { DragSource, DropZone, SystemIcon, TreeView } from '../components/system';
import type { SystemIconName, TreeViewItem, TreeViewKey } from '../components/system';
import { refreshSceneDocument } from '../document/sceneDocumentController';
import {
    addCompilerSceneNode,
    createCompilerPixiTemplateNode,
    type CompilerSceneAddablePixiType,
    deleteCompilerSceneNode,
    compilerSceneNodeLocator,
    getCompilerSceneDocument,
    selectCompilerSceneNode,
} from '../document/compilerSceneDocumentController';
import { useEditorStore } from '../editorStore';
import { useI18n } from '../i18n';
import {
    nodeTemplateDragDataType,
    createNodeTemplateNode,
    isNodeTemplateKind,
} from '../services/nodeTemplateLibrary';
import { createSceneInstanceNode } from '../services/sceneInstance';
import { hierarchyNodeDragPayload } from '../services/dragPayload';
import { editorDragDataTypes } from '../services/dragPayload';
import { findFileByPath, sceneDragDataType, readProjectFileText } from '../services/projectFileTree';
import type { CompilerSceneTemplateNode } from '../services/projectFileTree';
import { collectHierarchy, getNodeLocator, selectedNodeId, useCompilerSceneRevision, useDocumentRevision } from './common';

interface HierarchyTreeNode {
    depth: number;
    locator: string;
    node: NodeSpec;
}

export interface CompilerHierarchyTreeNode {
    depth: number;
    locator: string;
    node: CompilerSceneTemplateNode | 'scene' | CompilerSlot;
}

export interface CompilerSlot {
    kind: 'slot';
    owner: string;
    name: string;
    childCount: number;
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

const rootDropLocator = '__scene_root_drop__';

function nodeLabel(node: NodeSpec) {
    return node.name ?? node.key ?? node.id ?? 'Node';
}

function nodeKindIcon(node: NodeSpec): SystemIconName {
    switch (node.kind) {
        case 'container':
            return 'folder-open';
        case 'image':
            return 'image';
        case 'text':
            return 'letter-text';
        case 'input':
            return 'input';
        case 'shape':
            return node.shape?.type === 'roundedRect' ? 'square' : 'circle';
    }
}

function compilerNodeIcon(node: CompilerSceneTemplateNode | 'scene' | CompilerSlot): SystemIconName {
    if (node === 'scene') {
        return 'folder-open';
    }
    if (node.kind === 'slot') {
        return 'input';
    }
    if (node.kind === 'sceneInstance') {
        return 'folder-open';
    }
    if (node.kind === 'slotOutlet') {
        return 'input';
    }
    switch (node.type) {
        case 'Sprite':
        case 'NineSliceSprite':
        case 'TilingSprite':
            return 'image';
        case 'Text':
        case 'BitmapText':
        case 'HTMLText':
            return 'letter-text';
        case 'Graphics':
            return 'square';
        default:
            return 'folder-open';
    }
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

function compilerNodeLabel(node: CompilerSceneTemplateNode | 'scene' | CompilerSlot, sceneName: string) {
    if (node === 'scene') {
        return sceneName;
    }
    if (node.kind === 'slot') {
        return `slot: ${node.name}`;
    }
    if (node.kind === 'slotOutlet') {
        return `slot: ${node.name}`;
    }
    if (node.kind === 'sceneInstance') {
        return `${node.id ?? node.type} : ${node.scene}`;
    }
    return node.id ?? node.type;
}

export function buildCompilerHierarchyTreeItems(document: NonNullable<ReturnType<typeof getCompilerSceneDocument>>): TreeViewItem<CompilerHierarchyTreeNode>[] {
    return [{
        children: document.template.children.map((node, index) => compilerNodeTreeItem(document, node, 1, String(index))),
        id: '__scene__',
        item: {
            depth: 0,
            locator: '__scene__',
            node: 'scene',
        },
        textValue: document.template.name,
    }];
}

function compilerTreeItem(document = getCompilerSceneDocument()): TreeViewItem<CompilerHierarchyTreeNode>[] {
    if (!document) {
        return [];
    }
    return buildCompilerHierarchyTreeItems(document);
}

function compilerNodeTreeItem(document: NonNullable<ReturnType<typeof getCompilerSceneDocument>>, node: CompilerSceneTemplateNode, depth: number, path: string): TreeViewItem<CompilerHierarchyTreeNode> {
    const locator = compilerSceneNodeLocator(node, path);
    return {
        children: compilerNodeTreeItems(document, node, depth + 1, locator),
        id: locator,
        item: {
            depth,
            locator,
            node,
        },
        textValue: compilerNodeLabel(node, document.template.name),
    };
}

function compilerNodeTreeItems(document: NonNullable<ReturnType<typeof getCompilerSceneDocument>>, node: CompilerSceneTemplateNode, depth: number, path: string): TreeViewItem<CompilerHierarchyTreeNode>[] | undefined {
    if (node.kind === 'slotOutlet') {
        return undefined;
    }
    if (node.kind === 'pixi') {
        return node.children.map((child, index) => compilerNodeTreeItem(document, child, depth, `${path}/${index}`));
    }
    const slots = [
        ...new Set([
            ...Object.keys(document.sceneInterfaces[node.scene]?.slots ?? {}),
            ...Object.keys(node.slots),
        ]),
    ];
    return slots.map((slot) => {
        const children = node.slots[slot] ?? [];
        const locator = `${path}/slot:${slot}`;
        return {
            children: children.map((child, index) => compilerNodeTreeItem(document, child, depth + 1, `${locator}/${index}`)),
            id: locator,
            item: {
                depth,
                locator,
                node: {
                    kind: 'slot' as const,
                    owner: path,
                    name: slot,
                    childCount: children.length,
                },
            },
            textValue: `slot: ${slot}`,
        };
    });
}

function collectCompilerLocators(items: TreeViewItem<CompilerHierarchyTreeNode>[]): string[] {
    return items.flatMap((item) => [
        String(item.id),
        ...collectCompilerLocators(item.children ?? []),
    ]);
}

function canAddCompilerSceneNode(item: CompilerHierarchyTreeNode | undefined) {
    if (!item) {
        return true;
    }
    if (item.node === 'scene') {
        return true;
    }
    if (item.node.kind === 'slot') {
        return true;
    }
    return item.node.kind === 'pixi' && item.node.type === 'Container';
}

function canDeleteCompilerSceneNode(item: CompilerHierarchyTreeNode | undefined) {
    return Boolean(item && item.node !== 'scene' && item.node.kind !== 'slot' && item.node.kind !== 'slotOutlet');
}

function findCompilerHierarchyItem(items: TreeViewItem<CompilerHierarchyTreeNode>[], locator: string): CompilerHierarchyTreeNode | undefined {
    for (const item of items) {
        if (item.item.locator === locator) {
            return item.item;
        }
        const found = findCompilerHierarchyItem(item.children ?? [], locator);
        if (found) {
            return found;
        }
    }
    return undefined;
}

function collectNodeLocators(node: NodeSpec): string[] {
    const locator = node.key ?? node.id ?? node.name ?? 'root';
    return [
        locator,
        ...(node.kind === 'container' ? (node.children ?? []).flatMap(collectNodeLocators) : []),
    ];
}

function collectContainerLocators(node: NodeSpec): string[] {
    if (node.kind !== 'container') {
        return [];
    }
    const locator = node.key ?? node.id ?? node.name ?? 'root';
    return [
        locator,
        ...(node.children ?? []).flatMap(collectContainerLocators),
    ];
}

function sameStringArray(left: readonly string[], right: readonly string[]) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
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
    const expandedHierarchyNodes = useEditorStore((state) => state.expandedHierarchyNodesByScene);
    const setExpandedHierarchyNodes = useEditorStore((state) => state.setExpandedHierarchyNodes);
    const items = collectHierarchy(document.scene.root);
    const treeItems = [hierarchyTreeItem(document.scene.root)];
    const allNodeLocators = collectNodeLocators(document.scene.root);
    const allContainerLocators = collectContainerLocators(document.scene.root);
    const hierarchyStateKey = openedScenePath ?? getNodeLocator(document.scene.root);
    const savedExpandedKeys = expandedHierarchyNodes[hierarchyStateKey];
    const expandedKeys = savedExpandedKeys
        ? savedExpandedKeys.filter((key) => allNodeLocators.includes(key))
        : allContainerLocators;
    const selected = selectedNodeId(document);
    const selectedItemRef = useRef<HTMLDivElement | null>(null);
    const nodeRowRefs = useRef(new Map<string, HTMLDivElement>());
    const previousHierarchyStateKeyRef = useRef<string | undefined>(undefined);
    const previousContainerLocatorsRef = useRef<string[]>([]);
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
        const stateKeyChanged = previousHierarchyStateKeyRef.current !== hierarchyStateKey;
        const previousContainerLocators = stateKeyChanged ? allContainerLocators : previousContainerLocatorsRef.current;
        previousHierarchyStateKeyRef.current = hierarchyStateKey;
        previousContainerLocatorsRef.current = allContainerLocators;

        if (savedExpandedKeys) {
            const existing = savedExpandedKeys.filter((key) => allNodeLocators.includes(key));
            const previous = new Set(previousContainerLocators);
            const added = stateKeyChanged ? [] : allContainerLocators.filter((key) => !previous.has(key));
            const next = [...new Set([...existing, ...added])];
            if (!sameStringArray(next, savedExpandedKeys)) {
                setExpandedHierarchyNodes(hierarchyStateKey, next);
            }
            return;
        }
        setExpandedHierarchyNodes(hierarchyStateKey, allContainerLocators);
    }, [allContainerLocators.join('\n'), allNodeLocators.join('\n'), hierarchyStateKey, savedExpandedKeys, setExpandedHierarchyNodes]);

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

    const setAllNodesExpanded = () => {
        setExpandedHierarchyNodes(hierarchyStateKey, allContainerLocators);
    };

    const setAllNodesCollapsed = () => {
        setExpandedHierarchyNodes(hierarchyStateKey, [getNodeLocator(document.scene.root)]);
    };

    const updateExpandedKeys = (keys: Set<TreeViewKey>) => {
        setExpandedHierarchyNodes(hierarchyStateKey, [...keys].map(String));
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

    const moveHierarchyNodeToRoot = (sourceLocator: string) => {
        const source = locateNode(document.scene.root, sourceLocator);
        if (!source || source.node === document.scene.root) {
            return;
        }
        applyNodeCommand({
            op: 'reparentNode',
            node: sourceLocator,
            parent: getNodeLocator(document.scene.root),
        }, sourceLocator);
        setDropTarget(undefined);
    };

    const addNodeTemplateUnderNode = (kind: string, parent: string) => {
        if (!isNodeTemplateKind(kind)) {
            setError(t('nodeTemplateMissing'));
            return;
        }
        const locatedParent = locateNode(document.scene.root, parent);
        if (!locatedParent || !canContainChildNode(locatedParent.node, document.scene.root)) {
            setError(t('nodeCannotContainChildren'));
            return;
        }

        const node = createNodeTemplateNode(document, kind);
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

    const addNodeTemplateToRoot = (kind: string) => {
        addNodeTemplateUnderNode(kind, getNodeLocator(document.scene.root));
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

    const addSceneToRoot = async (scenePath: string) => {
        await addSceneUnderNode(scenePath, getNodeLocator(document.scene.root));
    };

    return (
        <div className="nodeTree" data-testid="hierarchy-tree">
            <div className="sectionHeader hierarchyHeader">
                <div>
                    <div className="sectionTitle">{t('hierarchyTreeTitle')}</div>
                    <small>{t('hierarchyDropHint')}</small>
                </div>
                <div className="hierarchyCreateActions" aria-label={t('hierarchyExpandActionsLabel')}>
                    <button onClick={setAllNodesExpanded} type="button">{t('expandAll')}</button>
                    <button onClick={setAllNodesCollapsed} type="button">{t('collapseAll')}</button>
                </div>
            </div>
            {error ? <div className="errorBox">{error}</div> : null}
            <TreeView
                ariaLabel={t('sceneNodeTreeLabel')}
                expandedKeys={expandedKeys}
                items={treeItems}
                onExpandedChange={updateExpandedKeys}
                onItemAction={(item) => document.setSelection({ type: 'node', node: item.locator })}
                onSelectedKeyChange={(_, item) => document.setSelection({ type: 'node', node: item.locator })}
                selectedKeys={selected ? [selected] : []}
                renderItem={({ item }) => (
                    <DropZone
                        acceptedTypes={[sceneDragDataType, nodeTemplateDragDataType, editorDragDataTypes.hierarchyNode]}
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
                            addNodeTemplateUnderNode(payload.data, item.locator);
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
                                <span className="nodeName">
                                    <SystemIcon name={nodeKindIcon(item.node)} />
                                    <strong>{nodeLabel(item.node)}</strong>
                                </span>
                            )}
                        </DragSource>
                    </DropZone>
                )}
            />
            <DropZone
                acceptedTypes={[sceneDragDataType, nodeTemplateDragDataType, editorDragDataTypes.hierarchyNode]}
                aria-label={t('dropToSceneRoot')}
                className={[
                    'rootDropZone',
                    dropTarget === rootDropLocator ? 'dropTarget' : '',
                ].filter(Boolean).join(' ')}
                getDropOperation={(types, allowedOperations) => {
                    if (types.has(editorDragDataTypes.hierarchyNode)) {
                        return allowedOperations.includes('move') ? 'move' : 'cancel';
                    }
                    return allowedOperations.includes('copy') ? 'copy' : allowedOperations[0] ?? 'copy';
                }}
                onDropEnter={() => setDropTarget(rootDropLocator)}
                onDropExit={() => setDropTarget((target) => target === rootDropLocator ? undefined : target)}
                onPayloadDrop={(payload) => {
                    setDropTarget(rootDropLocator);
                    setNodeDropTarget(undefined);
                    if (payload.type === editorDragDataTypes.hierarchyNode) {
                        moveHierarchyNodeToRoot(payload.data);
                        return;
                    }
                    if (payload.type === sceneDragDataType) {
                        void addSceneToRoot(payload.data);
                        return;
                    }
                    addNodeTemplateToRoot(payload.data);
                }}
            >
                <strong>{t('dropToSceneRoot')}</strong>
                <span>{t('hierarchyDropHint')}</span>
            </DropZone>
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

export function CompilerSceneHierarchyTree() {
    useCompilerSceneRevision();
    const compilerDocument = getCompilerSceneDocument();
    const t = useI18n();
    const [error, setError] = useState<string>();

    if (!compilerDocument) {
        return null;
    }

    const treeItems = compilerTreeItem(compilerDocument);
    const expandedKeys = collectCompilerLocators(treeItems);
    const selected = compilerDocument.selection.type === 'node' ? compilerDocument.selection.node : '__scene__';
    const selectedItem = selected === '__scene__'
        ? treeItems[0]?.item
        : findCompilerHierarchyItem(treeItems, selected);
    const canAddNode = canAddCompilerSceneNode(selectedItem);
    const canDeleteNode = canDeleteCompilerSceneNode(selectedItem);

    const addPixiNode = (type: CompilerSceneAddablePixiType) => {
        if (!canAddNode) {
            return;
        }
        const result = addCompilerSceneNode(selected, createCompilerPixiTemplateNode(compilerDocument.template, type));
        if (!result.ok) {
            setError(result.error);
            return;
        }
        setError(undefined);
    };
    const deleteSelectedNode = () => {
        if (!canDeleteNode) {
            return;
        }
        const result = deleteCompilerSceneNode(selected);
        if (!result.ok) {
            setError(result.error);
            return;
        }
        setError(undefined);
    };

    return (
        <div className="nodeTree" data-testid="compiler-scene-hierarchy">
            <div className="sectionHeader hierarchyHeader">
                <div>
                    <div className="sectionTitle">{t('hierarchyTreeTitle')}</div>
                    <small>Compiler Scene</small>
                </div>
                <div className="hierarchyCreateActions" aria-label="Add compiler scene node">
                    <button disabled={!canAddNode} onClick={() => addPixiNode('Container')} title="Add Container" type="button">
                        Container
                    </button>
                    <button disabled={!canAddNode} onClick={() => addPixiNode('Text')} title="Add Text" type="button">
                        Text
                    </button>
                    <button disabled={!canAddNode} onClick={() => addPixiNode('Graphics')} title="Add Graphics" type="button">
                        Graphics
                    </button>
                    <button disabled={!canDeleteNode} onClick={deleteSelectedNode} title="Delete selected node" type="button">
                        <SystemIcon name="trash" />
                    </button>
                </div>
            </div>
            {error ? <div className="errorBox">{error}</div> : null}
            <TreeView
                ariaLabel={t('sceneNodeTreeLabel')}
                expandedKeys={expandedKeys}
                items={treeItems}
                onItemAction={(item) => selectCompilerSceneNode(item.locator)}
                onSelectedKeyChange={(_, item) => selectCompilerSceneNode(item.locator)}
                selectedKeys={[selected]}
                renderItem={({ item }) => (
                    <div
                        className={[
                            'nodeRow',
                            item.locator === selected ? 'selected' : '',
                        ].filter(Boolean).join(' ')}
                        style={{ '--tree-indent': `${item.depth * 14}px` } as React.CSSProperties}
                    >
                        <span className="nodeName">
                            <SystemIcon name={compilerNodeIcon(item.node)} />
                            <strong>{compilerNodeLabel(item.node, compilerDocument.template.name)}</strong>
                        </span>
                    </div>
                )}
            />
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
