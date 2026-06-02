import { useEffect, useRef, useState } from 'react';
import { pixiSceneNodeAcceptsChildren } from '../../../../packages/pixifact/src/compiler/pixiNodeSchema';
import { defaultSceneSourceRoots, resolveSceneReference, toPosixPath } from '../../../../packages/pixifact/src/compiler/sceneAssetPair';
import { DragSource, DropZone, SystemIcon, TreeView } from '../components/system';
import type { SystemIconName, TreeViewItem, TreeViewKey } from '../components/system';
import {
    addCompilerSceneNode,
    addCompilerSceneNodeAtTarget,
    compilerPixiTypeFromNodeTemplate,
    createCompilerPixiTemplateNode,
    deleteCompilerSceneNode,
    compilerSceneNodeLocator,
    getCompilerSceneDocument,
    moveCompilerSceneNode,
    selectCompilerSceneNode,
} from '../document/compilerSceneDocumentController';
import { useEditorStore } from '../editorStore';
import { useI18n } from '../i18n';
import { pixiNodeTemplateLibrary } from '../services/nodeTemplateLibrary';
import { editorDragDataTypes, hierarchyNodeDragPayload } from '../services/dragPayload';
import { sceneDragDataType } from '../services/projectFileTree';
import type { CompilerSceneTemplateNode } from '../services/projectFileTree';
import { addDroppedCompilerSceneInstance } from '../services/compilerSceneDrop';
import { useCompilerSceneRevision } from './common';

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

interface CompilerNodeContextMenuState {
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
            ...Object.keys(compilerSceneInterfaceForNode(document, node)?.slots ?? {}),
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

function compilerSceneInterfaceForNode(
    document: NonNullable<ReturnType<typeof getCompilerSceneDocument>>,
    node: Extract<CompilerSceneTemplateNode, { kind: 'sceneInstance' }>,
) {
    try {
        return document.sceneInterfaces[resolveSceneReference(compilerDocumentAssetPath(document.scenePath), node.scene)];
    } catch {
        return undefined;
    }
}

function compilerDocumentAssetPath(scenePath: string) {
    const parts = toPosixPath(scenePath).split('/').filter(Boolean);
    for (const sourceRoot of defaultSceneSourceRoots) {
        const index = parts.indexOf(sourceRoot);
        if (index >= 0) {
            return parts.slice(index).join('/');
        }
    }
    return parts.join('/');
}

function collectExpandableCompilerLocators(items: TreeViewItem<CompilerHierarchyTreeNode>[]): string[] {
    return items.flatMap((item) => [
        ...(item.children?.length ? [String(item.id)] : []),
        ...collectExpandableCompilerLocators(item.children ?? []),
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
    return item.node.kind === 'pixi' && pixiSceneNodeAcceptsChildren(item.node.type);
}

function canDeleteCompilerSceneNode(item: CompilerHierarchyTreeNode | undefined) {
    return Boolean(item && item.node !== 'scene' && item.node.kind !== 'slot');
}

function canDragCompilerSceneNode(item: CompilerHierarchyTreeNode) {
    return item.node !== 'scene' && item.node.kind !== 'slot';
}

function compilerNodeDropPosition(item: CompilerHierarchyTreeNode, y: number, height: number) {
    if (item.node === 'scene' || item.node.kind === 'slot') {
        return 'inside' as const;
    }
    const position = nodeDropPosition(y, height);
    if (position === 'inside' && !canAddCompilerSceneNode(item)) {
        return y < height / 2 ? 'before' : 'after';
    }
    return position;
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

export function CompilerSceneHierarchyTree() {
    useCompilerSceneRevision();
    const compilerDocument = getCompilerSceneDocument();
    const t = useI18n();
    const projectTree = useEditorStore((state) => state.projectTree);
    const openedScenePath = useEditorStore((state) => state.openedScenePath);
    const [error, setError] = useState<string>();
    const [dropTarget, setDropTarget] = useState<string>();
    const [nodeDropTarget, setNodeDropTarget] = useState<NodeDropTargetState>();
    const [draggedNodeLocator, setDraggedNodeLocator] = useState<string>();
    const [contextMenu, setContextMenu] = useState<CompilerNodeContextMenuState>();
    const [expandedKeys, setExpandedKeys] = useState<Set<TreeViewKey>>(new Set());
    const previousExpandableKeysRef = useRef<{ scenePath?: string; keys: Set<string> }>({ keys: new Set() });
    const nodeRowRefs = useRef(new Map<string, HTMLDivElement>());

    if (!compilerDocument) {
        return null;
    }

    const treeItems = compilerTreeItem(compilerDocument);
    const expandableKeys = collectExpandableCompilerLocators(treeItems);
    const expandableKeysSignature = expandableKeys.join('\n');
    const selected = compilerDocument.selection.type === 'node' ? compilerDocument.selection.node : '__scene__';

    useEffect(() => {
        const availableKeys = new Set(expandableKeys);
        const previous = previousExpandableKeysRef.current;
        setExpandedKeys((currentKeys) => {
            if (previous.scenePath !== compilerDocument.scenePath || previous.keys.size === 0) {
                return new Set(availableKeys);
            }
            const nextKeys = new Set<TreeViewKey>();
            for (const key of currentKeys) {
                if (availableKeys.has(String(key))) {
                    nextKeys.add(key);
                }
            }
            for (const key of availableKeys) {
                if (!previous.keys.has(key)) {
                    nextKeys.add(key);
                }
            }
            return nextKeys;
        });
        previousExpandableKeysRef.current = {
            scenePath: compilerDocument.scenePath,
            keys: availableKeys,
        };
    }, [compilerDocument.scenePath, expandableKeysSignature]);

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

    const addCompilerNodeTemplateUnderNode = (kind: string, parent: string) => {
        const type = compilerPixiTypeFromNodeTemplate(kind);
        if (!type) {
            setError('Compiler Scene 暂不支持该节点模板。');
            return;
        }
        const document = getCompilerSceneDocument();
        if (!document) {
            return;
        }
        const result = addCompilerSceneNode(parent, createCompilerPixiTemplateNode(document.template, type));
        if (!result.ok) {
            setError(result.error);
            return;
        }
        setDropTarget(undefined);
        setError(undefined);
    };
    const addCompilerNodeTemplateAtTarget = (kind: string, target: string) => {
        const type = compilerPixiTypeFromNodeTemplate(kind);
        if (!type) {
            setError('Compiler Scene 暂不支持该节点模板。');
            return;
        }
        const document = getCompilerSceneDocument();
        if (!document) {
            return;
        }
        const result = addCompilerSceneNodeAtTarget(target, createCompilerPixiTemplateNode(document.template, type));
        if (!result.ok) {
            setError(result.error);
            return;
        }
        setContextMenu(undefined);
        setDropTarget(undefined);
        setError(undefined);
    };
    const addCompilerSceneUnderNode = async (scenePath: string, parent: string) => {
        const result = await addDroppedCompilerSceneInstance({
            openedScenePath,
            projectTree,
            scenePath,
            parentLocator: parent,
        });
        if (!result.ok) {
            setError('errorKey' in result ? t(result.errorKey) : result.error);
            return;
        }
        setDropTarget(undefined);
        setError(undefined);
    };
    const deleteCompilerContextNode = (locator: string) => {
        const item = findCompilerHierarchyItem(treeItems, locator);
        if (!canDeleteCompilerSceneNode(item)) {
            return;
        }
        const result = deleteCompilerSceneNode(locator);
        if (!result.ok) {
            setError(result.error);
            return;
        }
        setContextMenu(undefined);
        setError(undefined);
    };
    const moveCompilerNode = (sourceLocator: string, targetLocator: string, position: NodeDropPosition) => {
        const result = moveCompilerSceneNode(sourceLocator, targetLocator, position);
        if (!result.ok) {
            setError(result.error);
            setNodeDropTarget(undefined);
            return;
        }
        setDropTarget(undefined);
        setNodeDropTarget(undefined);
        setDraggedNodeLocator(undefined);
        setError(undefined);
    };
    const moveCompilerNodeToRoot = (sourceLocator: string) => {
        moveCompilerNode(sourceLocator, '__scene__', 'inside');
    };

    return (
        <div className="nodeTree" data-testid="compiler-scene-hierarchy">
            <div className="sectionHeader hierarchyHeader">
                <div>
                    <div className="sectionTitle">{t('hierarchyTreeTitle')}</div>
                </div>
            </div>
            {error ? <div className="errorBox">{error}</div> : null}
            <TreeView
                ariaLabel={t('sceneNodeTreeLabel')}
                expandedKeys={expandedKeys}
                items={treeItems}
                onExpandedChange={setExpandedKeys}
                onItemAction={(item) => selectCompilerSceneNode(item.locator)}
                onSelectedKeyChange={(_, item) => selectCompilerSceneNode(item.locator)}
                selectedKeys={[selected]}
                renderItem={({ item }) => (
                    <DropZone
                        acceptedTypes={[sceneDragDataType, editorDragDataTypes.hierarchyNode]}
                        aria-label={t('dropToNode', { node: compilerNodeLabel(item.node, compilerDocument.template.name) })}
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
                            if (!canAddCompilerSceneNode(item)) {
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
                                setNodeDropTarget({
                                    locator: item.locator,
                                    position: compilerNodeDropPosition(item, event.y, height),
                                });
                            } else {
                                setNodeDropTarget(undefined);
                            }
                        }}
                        onPayloadDrop={(payload) => {
                            setDropTarget(item.locator);
                            setNodeDropTarget(undefined);
                            if (payload.type === editorDragDataTypes.hierarchyNode) {
                                moveCompilerNode(payload.data, item.locator, nodeDropTarget?.locator === item.locator ? nodeDropTarget.position : 'inside');
                                return;
                            }
                            if (payload.type === sceneDragDataType) {
                                void addCompilerSceneUnderNode(payload.data, item.locator);
                                return;
                            }
                        }}
                        ref={(element) => {
                            if (element) {
                                nodeRowRefs.current.set(item.locator, element);
                            } else {
                                nodeRowRefs.current.delete(item.locator);
                            }
                        }}
                        style={{ '--tree-indent': `${item.depth * 14}px` } as React.CSSProperties}
                        onContextMenu={(event) => {
                            event.preventDefault();
                            selectCompilerSceneNode(item.locator);
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
                            disabled={!canDragCompilerSceneNode(item)}
                            getAllowedDropOperations={() => ['move']}
                            onSystemDragEnd={() => {
                                setDraggedNodeLocator(undefined);
                                setNodeDropTarget(undefined);
                            }}
                            onSystemDragStart={() => setDraggedNodeLocator(item.locator)}
                            payload={hierarchyNodeDragPayload(item.locator, compilerNodeLabel(item.node, compilerDocument.template.name))}
                        >
                            <span className="nodeName">
                                <SystemIcon name={compilerNodeIcon(item.node)} />
                                <strong>{compilerNodeLabel(item.node, compilerDocument.template.name)}</strong>
                            </span>
                        </DragSource>
                    </DropZone>
                )}
            />
            {contextMenu ? (
                <div
                    className="nodeContextMenu compilerNodeContextMenu"
                    data-testid="compiler-node-context-menu"
                    onClick={(event) => event.stopPropagation()}
                    onContextMenu={(event) => event.preventDefault()}
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                    <div className="nodeContextSubmenu">
                        <button className="nodeContextSubmenuTrigger" type="button">
                            <span>{t('addNode')}</span>
                            <span aria-hidden="true">›</span>
                        </button>
                        <div className="nodeContextSubmenuPanel">
                            {pixiNodeTemplateLibrary.map((item) => (
                                <button
                                    data-node-template={item.kind}
                                    key={item.kind}
                                    onClick={() => addCompilerNodeTemplateAtTarget(item.kind, contextMenu.locator)}
                                    type="button"
                                >
                                    {t(item.nameKey)}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="nodeContextMenuSeparator" />
                    <button
                        data-testid="compiler-node-menu-delete"
                        disabled={!canDeleteCompilerSceneNode(findCompilerHierarchyItem(treeItems, contextMenu.locator))}
                        onClick={() => deleteCompilerContextNode(contextMenu.locator)}
                        type="button"
                    >
                        {t('delete')}
                    </button>
                </div>
            ) : null}
            <DropZone
                acceptedTypes={[sceneDragDataType, editorDragDataTypes.hierarchyNode]}
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
                        moveCompilerNodeToRoot(payload.data);
                        return;
                    }
                    if (payload.type === sceneDragDataType) {
                        void addCompilerSceneUnderNode(payload.data, '__scene__');
                    }
                }}
            />
        </div>
    );
}
