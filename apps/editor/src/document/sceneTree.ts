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

type SceneNodeAddressSegment =
    | { kind: 'child'; index: number }
    | { kind: 'slot'; name: string };

function findSceneNodeAddress(
    nodes: readonly SceneTemplateNode[],
    locator: string,
    parentLocator = '__scene__',
    parentAddress: SceneNodeAddressSegment[] = [],
): SceneNodeAddressSegment[] | undefined {
    for (const [index, node] of nodes.entries()) {
        const path = parentLocator === '__scene__' ? String(index) : `${parentLocator}/${index}`;
        const nodeLocator = compilerSceneNodeLocator(node, path);
        const address = [...parentAddress, { kind: 'child' as const, index }];
        if (nodeLocator === locator) {
            return address;
        }
        if (node.kind === 'pixi') {
            const childAddress = findSceneNodeAddress(node.children, locator, nodeLocator, address);
            if (childAddress) return childAddress;
        } else if (node.kind === 'sceneInstance') {
            for (const [slot, children] of Object.entries(node.slots)) {
                const childAddress = findSceneNodeAddress(
                    children,
                    locator,
                    `${nodeLocator}/slot:${slot}`,
                    [...address, { kind: 'slot', name: slot }],
                );
                if (childAddress) return childAddress;
            }
        }
    }
    return undefined;
}

function nodeTypeMatches(left: SceneTemplateNode, right: SceneTemplateNode) {
    if (left.kind !== right.kind) return false;
    if (left.kind === 'slotOutlet' && right.kind === 'slotOutlet') return true;
    return left.kind !== 'slotOutlet'
        && right.kind !== 'slotOutlet'
        && left.type === right.type;
}

function nodeIdentityMatches(left: SceneTemplateNode, right: SceneTemplateNode) {
    if (!nodeTypeMatches(left, right)) return false;
    if (left.kind === 'slotOutlet' && right.kind === 'slotOutlet') {
        return left.name === right.name;
    }
    if (left.kind === 'sceneInstance' && right.kind === 'sceneInstance') {
        return left.id === right.id && left.scene === right.scene;
    }
    return left.kind === 'pixi' && right.kind === 'pixi' && left.id === right.id;
}

function resolveAddress(template: SceneTemplate, address: readonly SceneNodeAddressSegment[]) {
    let nodes: readonly SceneTemplateNode[] = template.children;
    let node: SceneTemplateNode | undefined;
    for (const segment of address) {
        if (segment.kind === 'slot') {
            if (node?.kind !== 'sceneInstance') return undefined;
            nodes = node.slots[segment.name] ?? [];
            node = undefined;
            continue;
        }
        node = nodes[segment.index];
        if (!node) return undefined;
        nodes = node.kind === 'pixi' ? node.children : [];
    }
    return node;
}

function structuralAddressCanRetarget(
    before: SceneTemplate,
    after: SceneTemplate,
    address: readonly SceneNodeAddressSegment[],
) {
    let beforeNodes: readonly SceneTemplateNode[] = before.children;
    let afterNodes: readonly SceneTemplateNode[] = after.children;
    let beforeNode: SceneTemplateNode | undefined;
    let afterNode: SceneTemplateNode | undefined;

    for (const [addressIndex, segment] of address.entries()) {
        if (segment.kind === 'slot') {
            if (beforeNode?.kind !== 'sceneInstance' || afterNode?.kind !== 'sceneInstance') return false;
            beforeNodes = beforeNode.slots[segment.name] ?? [];
            afterNodes = afterNode.slots[segment.name] ?? [];
            beforeNode = undefined;
            afterNode = undefined;
            continue;
        }
        if (beforeNodes.length !== afterNodes.length) return false;
        for (let index = 0; index < beforeNodes.length; index += 1) {
            if (index !== segment.index && !nodeIdentityMatches(beforeNodes[index], afterNodes[index])) {
                return false;
            }
        }
        beforeNode = beforeNodes[segment.index];
        afterNode = afterNodes[segment.index];
        if (!beforeNode || !afterNode || !nodeTypeMatches(beforeNode, afterNode)) return false;
        const isSelectedNode = addressIndex === address.length - 1;
        if (!isSelectedNode && !nodeIdentityMatches(beforeNode, afterNode)) return false;
        beforeNodes = beforeNode.kind === 'pixi' ? beforeNode.children : [];
        afterNodes = afterNode.kind === 'pixi' ? afterNode.children : [];
    }
    return true;
}

function locatorForNode(template: SceneTemplate, target: SceneTemplateNode) {
    const queue = [...sceneTreeEntries(template.children)];
    while (queue.length > 0) {
        const entry = queue.shift()!;
        if (entry.node === target) return entry.locator;
        queue.unshift(...entry.children);
    }
    return undefined;
}

function locatorsForId(template: SceneTemplate, id: string, expected: SceneTemplateNode) {
    const matches: string[] = [];
    const queue = [...sceneTreeEntries(template.children)];
    while (queue.length > 0) {
        const entry = queue.shift()!;
        if (entry.node.kind !== 'slotOutlet' && entry.node.id === id && nodeTypeMatches(expected, entry.node)) {
            matches.push(entry.locator);
        }
        queue.unshift(...entry.children);
    }
    return matches;
}

export function remapSceneSelection(before: SceneTemplate, after: SceneTemplate, locator?: string) {
    if (!locator) return undefined;
    if (findSceneTreeEntry(after.children, locator)) return locator;
    const previous = findSceneTreeEntry(before.children, locator)?.node;
    const address = findSceneNodeAddress(before.children, locator);
    if (!previous || !address) return undefined;

    const samePosition = resolveAddress(after, address);
    if (samePosition && structuralAddressCanRetarget(before, after, address)) {
        return locatorForNode(after, samePosition);
    }
    if (previous.kind !== 'slotOutlet' && previous.id) {
        const matches = locatorsForId(after, previous.id, previous);
        if (matches.length === 1) return matches[0];
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
