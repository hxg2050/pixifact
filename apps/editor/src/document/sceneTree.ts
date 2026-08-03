import {
    compilerSceneNodeLocator,
    pixiSceneNodeAcceptsChildren,
    pixiSceneNodeDefaults,
    sceneLocalName,
    type PixiSceneNodeType,
    type PixiTemplateNode,
    type SceneTemplate,
    type SceneTemplateNode,
    type SceneTemplateValue,
} from 'pixifact/compiler';

export interface EditorSceneAsset {
    kind: 'image' | 'scene';
    path: string;
}

export interface SceneAssetPosition {
    x: number;
    y: number;
}

export interface SceneTreeEntry {
    acceptsChildren: boolean;
    children: SceneTreeEntry[];
    index: number;
    locator: string;
    node: SceneTemplateNode;
    parentLocator: string;
}

export interface SceneTreeDropTarget {
    index: number;
    locator: string;
    mode: 'before' | 'inside' | 'after';
    parent: string;
}

export function sceneTreeEntries(
    nodes: readonly SceneTemplateNode[],
    parentLocator = '__scene__',
): SceneTreeEntry[] {
    return nodes.map((node, index) => {
        const path = parentLocator === '__scene__' ? String(index) : `${parentLocator}/${index}`;
        const locator = compilerSceneNodeLocator(node, path);
        const children = node.kind === 'pixi'
            ? sceneTreeEntries(node.children, locator)
            : node.kind === 'sceneInstance'
                ? Object.entries(node.slots).flatMap(([slot, slotChildren]) => (
                    sceneTreeEntries(slotChildren, `${locator}/slot:${slot}`)
                ))
                : [];
        return {
            acceptsChildren: node.kind === 'pixi' && pixiSceneNodeAcceptsChildren(node.type),
            children,
            index,
            locator,
            node,
            parentLocator,
        };
    });
}

export function findSceneNodeByLocator(nodes: readonly SceneTemplateNode[], locator: string) {
    return findSceneTreeEntry(nodes, locator)?.node;
}

export function findSceneTreeEntry(nodes: readonly SceneTemplateNode[], locator: string) {
    const queue = [...sceneTreeEntries(nodes)];
    while (queue.length > 0) {
        const entry = queue.shift()!;
        if (entry.locator === locator) {
            return entry;
        }
        queue.unshift(...entry.children);
    }
    return undefined;
}

export function createPixiSceneNode(template: SceneTemplate, type: PixiSceneNodeType): PixiTemplateNode {
    const ids = collectSceneNodeIds(template.children);
    return {
        kind: 'pixi',
        type,
        id: uniqueSceneNodeId(lowercaseFirst(type), ids),
        props: pixiSceneNodeDefaults(type),
        children: [],
    };
}

export function createSceneAssetNode(
    template: SceneTemplate,
    asset: EditorSceneAsset,
    position?: SceneAssetPosition,
): SceneTemplateNode {
    const positionProps: Record<string, SceneTemplateValue> = position
        ? { x: position.x, y: position.y }
        : {};
    if (asset.kind === 'image') {
        const node = createPixiSceneNode(template, 'Image');
        node.props = {
            ...positionProps,
            ...node.props,
            texture: asset.path,
        };
        return node;
    }
    const type = sceneLocalName(asset.path);
    return {
        kind: 'sceneInstance',
        type,
        id: uniqueSceneNodeId(lowercaseFirst(type), collectSceneNodeIds(template.children)),
        scene: asset.path,
        props: positionProps,
        events: {},
        slots: {},
    };
}

export function duplicateSceneNode(template: SceneTemplate, node: SceneTemplateNode) {
    const copy = structuredClone(node) as SceneTemplateNode;
    const ids = collectSceneNodeIds(template.children);
    assignUniqueCopyIds(copy, ids, true);
    return copy;
}

function collectSceneNodeIds(nodes: readonly SceneTemplateNode[]) {
    const ids = new Set<string>();
    visitSceneNodes(nodes, (node) => {
        if (node.kind !== 'slotOutlet' && node.id) {
            ids.add(node.id);
        }
    });
    return ids;
}

function assignUniqueCopyIds(node: SceneTemplateNode, ids: Set<string>, forceId: boolean) {
    if (node.kind === 'slotOutlet') return;
    if (node.id || forceId) {
        node.id = uniqueSceneNodeId(node.id ?? lowercaseFirst(node.type), ids);
    }
    if (node.kind === 'pixi') {
        for (const child of node.children) {
            assignUniqueCopyIds(child, ids, false);
        }
        return;
    }
    for (const children of Object.values(node.slots)) {
        for (const child of children) {
            assignUniqueCopyIds(child, ids, false);
        }
    }
}

function uniqueSceneNodeId(base: string, ids: Set<string>) {
    if (!ids.has(base)) {
        ids.add(base);
        return base;
    }
    let suffix = 2;
    while (ids.has(`${base}${suffix}`)) {
        suffix += 1;
    }
    const id = `${base}${suffix}`;
    ids.add(id);
    return id;
}

function lowercaseFirst(value: string) {
    return `${value.charAt(0).toLowerCase()}${value.slice(1)}`;
}

function visitSceneNodes(nodes: readonly SceneTemplateNode[], visit: (node: SceneTemplateNode) => void) {
    for (const node of nodes) {
        visit(node);
        if (node.kind === 'pixi') {
            visitSceneNodes(node.children, visit);
        } else if (node.kind === 'sceneInstance') {
            for (const children of Object.values(node.slots)) {
                visitSceneNodes(children, visit);
            }
        }
    }
}
