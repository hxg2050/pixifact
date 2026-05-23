import type { SceneTemplate, SceneTemplateInterface, SceneTemplateValue } from '../../../../packages/pixifact/src/compiler/spec';
import { pixiSceneNodeAcceptsChildren, pixiSceneNodeDefaults } from '../../../../packages/pixifact/src/compiler/pixiNodeSchema';
import type { PixiSceneNodeType } from '../../../../packages/pixifact/src/compiler/pixiNodeSchema';
import type {
    CompilerSceneScriptInterface,
    CompilerSceneTemplateNode,
} from '../services/projectFileTree';
import type { NodeTemplateKind, PixiNodeTemplateKind } from '../services/nodeTemplateLibrary';
import type { SceneToolKind } from '../services/sceneToolLibrary';

export type CompilerSceneAddablePixiType = PixiSceneNodeType;
export type CompilerSceneNodeDropPosition = 'before' | 'inside' | 'after';

export type CompilerSceneSelection =
    | { type: 'scene' }
    | { type: 'node'; node: string };

export interface CompilerSceneDocument {
    scenePath: string;
    template: SceneTemplate;
    descriptor?: CompilerSceneScriptInterface;
    sceneInterfaces: Record<string, SceneTemplateInterface>;
    selection: CompilerSceneSelection;
    dirty: boolean;
}

const listeners = new Set<() => void>();
let revision = 0;
let document: CompilerSceneDocument | undefined;

function emitCompilerSceneUpdate() {
    revision += 1;
    for (const listener of listeners) {
        listener();
    }
}

export function getCompilerSceneDocument() {
    return document;
}

export function getCompilerSceneDocumentRevision() {
    return revision;
}

export function subscribeCompilerSceneDocument(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function loadCompilerSceneDocument(next: Omit<CompilerSceneDocument, 'selection' | 'dirty'>) {
    document = {
        ...next,
        selection: { type: 'scene' },
        dirty: false,
    };
    emitCompilerSceneUpdate();
}

export function closeCompilerSceneDocument() {
    document = undefined;
    emitCompilerSceneUpdate();
}

export function resetCompilerSceneDocument() {
    closeCompilerSceneDocument();
}

export function selectCompilerSceneNode(node: string) {
    if (!document) {
        return;
    }
    document = {
        ...document,
        selection: { type: 'node', node },
    };
    emitCompilerSceneUpdate();
}

export function updateCompilerSceneNode(
    locator: string,
    updates: {
        id?: string;
        slotName?: string;
        events?: Record<string, string | undefined>;
        props?: Record<string, SceneTemplateValue | undefined>;
    },
) {
    if (!document) {
        return;
    }
    const template = structuredClone(document.template);
    const updated = updateCompilerSceneNodes(template.children, locator, updates);
    if (!updated) {
        return;
    }
    document = {
        ...document,
        template,
        selection: updates.id !== undefined || updates.slotName !== undefined
            ? { type: 'node', node: updated.locator }
            : document.selection,
        dirty: true,
    };
    emitCompilerSceneUpdate();
}

export function createCompilerPixiTemplateNode(template: SceneTemplate, type: CompilerSceneAddablePixiType): CompilerSceneTemplateNode {
    const id = nextCompilerSceneNodeId(template.children, type);
    return {
        kind: 'pixi',
        type,
        id,
        props: pixiSceneNodeDefaults(type),
        children: [],
    };
}

function compilerPixiTypeFromPixiNodeTemplate(kind: PixiNodeTemplateKind): CompilerSceneAddablePixiType {
    switch (kind) {
        case 'pixi-container':
            return 'Container';
        case 'pixi-sprite':
            return 'Sprite';
        case 'pixi-nine-slice-sprite':
            return 'NineSliceSprite';
        case 'pixi-tiling-sprite':
            return 'TilingSprite';
        case 'pixi-text':
            return 'Text';
        case 'pixi-bitmap-text':
            return 'BitmapText';
        case 'pixi-html-text':
            return 'HTMLText';
        case 'pixi-graphics':
            return 'Graphics';
    }
}

export function compilerPixiTypeFromNodeTemplate(kind: NodeTemplateKind): CompilerSceneAddablePixiType | undefined {
    if (kind.startsWith('pixi-')) {
        return compilerPixiTypeFromPixiNodeTemplate(kind as PixiNodeTemplateKind);
    }
    if (kind === 'container') {
        return 'Container';
    }
    if (kind === 'image') {
        return 'Sprite';
    }
    if (kind === 'text') {
        return 'Text';
    }
    if (kind === 'shape') {
        return 'Graphics';
    }
    return undefined;
}

export function createCompilerSceneInstanceTemplateNode(
    template: SceneTemplate,
    scene: SceneTemplate,
    scenePath: string,
    sceneInterface: SceneTemplateInterface = scene.interface,
    className = scene.script?.className ?? scene.name,
): CompilerSceneTemplateNode {
    return {
        kind: 'sceneInstance',
        type: className,
        id: nextCompilerSceneNodeId(template.children, className),
        scene: scenePath,
        props: {},
        events: {},
        slots: Object.fromEntries(Object.keys(sceneInterface.slots).map((slot) => [slot, []])),
    };
}

export function createCompilerSceneToolTemplateNode(template: SceneTemplate, kind: SceneToolKind): CompilerSceneTemplateNode {
    return {
        kind: 'slotOutlet',
        name: nextCompilerSceneSlotName(template.children),
    };
}

export function addCompilerSceneInstanceNode(
    parentLocator: string,
    scenePath: string,
    scene: SceneTemplate,
    sceneInterface: SceneTemplateInterface = scene.interface,
    className = scene.script?.className ?? scene.name,
) {
    if (!document) {
        return {
            ok: false as const,
            error: '未打开 Compiler Scene。',
        };
    }

    const template = structuredClone(document.template);
    const node = createCompilerSceneInstanceTemplateNode(template, scene, scenePath, sceneInterface, className);
    const inserted = insertCompilerSceneNode(template.children, parentLocator, node);
    if (!inserted) {
        return {
            ok: false as const,
            error: '当前选择不能包含子节点。',
        };
    }

    document = {
        ...document,
        template,
        sceneInterfaces: {
            ...document.sceneInterfaces,
            [scenePath]: sceneInterface,
        },
        selection: { type: 'node', node: inserted.locator },
        dirty: true,
    };
    emitCompilerSceneUpdate();

    return {
        ok: true as const,
        locator: inserted.locator,
    };
}

export function addCompilerSceneNode(parentLocator: string, node: CompilerSceneTemplateNode) {
    if (!document) {
        return {
            ok: false as const,
            error: '未打开 Compiler Scene。',
        };
    }

    const template = structuredClone(document.template);
    const inserted = insertCompilerSceneNode(template.children, parentLocator, structuredClone(node));
    if (!inserted) {
        return {
            ok: false as const,
            error: '当前选择不能包含子节点。',
        };
    }

    document = {
        ...document,
        template,
        selection: { type: 'node', node: inserted.locator },
        dirty: true,
    };
    emitCompilerSceneUpdate();

    return {
        ok: true as const,
        locator: inserted.locator,
    };
}

export function deleteCompilerSceneNode(locator: string) {
    if (!document) {
        return {
            ok: false as const,
            error: '未打开 Compiler Scene。',
        };
    }

    const template = structuredClone(document.template);
    const deleted = removeCompilerSceneNode(template.children, locator, { type: 'scene' });
    if (!deleted) {
        return {
            ok: false as const,
            error: '当前选择不能删除。',
        };
    }

    document = {
        ...document,
        template,
        selection: deleted.selection,
        dirty: true,
    };
    emitCompilerSceneUpdate();

    return {
        ok: true as const,
        selection: deleted.selection,
    };
}

export function moveCompilerSceneNode(
    sourceLocator: string,
    targetLocator: string,
    position: CompilerSceneNodeDropPosition,
) {
    if (!document) {
        return {
            ok: false as const,
            error: '未打开 Compiler Scene。',
        };
    }
    if (sourceLocator === targetLocator || targetLocator.startsWith(`${sourceLocator}/`)) {
        return {
            ok: false as const,
            error: '当前选择不能移动。',
        };
    }

    const template = structuredClone(document.template);
    const source = findCompilerSceneNodeLocation(template.children, sourceLocator);
    if (!source) {
        return {
            ok: false as const,
            error: '当前选择不能移动。',
        };
    }

    const target = position === 'inside'
        ? findCompilerSceneChildList(template.children, targetLocator)
        : findCompilerSceneSiblingTarget(template.children, targetLocator, position);
    if (!target) {
        return {
            ok: false as const,
            error: '目标位置不能接收该节点。',
        };
    }
    if (source.node.kind === 'slotOutlet' && !target.acceptsSlotOutlet) {
        return {
            ok: false as const,
            error: '目标位置不能接收该节点。',
        };
    }

    const [node] = source.nodes.splice(source.index, 1);
    let index = target.index;
    if (source.nodes === target.nodes && source.index < index) {
        index -= 1;
    }
    target.nodes.splice(index, 0, node);

    const locator = findCompilerSceneNodeLocator(template.children, node);
    if (!locator) {
        throw new Error('Moved Compiler Scene node is missing from the template.');
    }

    document = {
        ...document,
        template,
        selection: { type: 'node', node: locator },
        dirty: true,
    };
    emitCompilerSceneUpdate();

    return {
        ok: true as const,
        locator,
    };
}

export function markCompilerSceneSaved() {
    if (!document) {
        return;
    }
    document = {
        ...document,
        dirty: false,
    };
    emitCompilerSceneUpdate();
}

export function compilerSceneNodeLocator(node: CompilerSceneTemplateNode, path = '') {
    const suffix = node.kind === 'slotOutlet'
        ? `slot:${node.name}`
        : node.id ?? (node.kind === 'sceneInstance' ? `${node.type}:${node.scene}` : node.type);
    if (path) {
        return `${path}:${suffix}`;
    }
    if (node.kind === 'slotOutlet') {
        return suffix;
    }
    return suffix;
}

function nextCompilerSceneNodeId(nodes: readonly CompilerSceneTemplateNode[], type: string) {
    const ids = collectCompilerSceneNodeIds(nodes);
    const base = type[0].toLowerCase() + type.slice(1);
    let index = 1;
    let id = `${base}${index}`;
    while (ids.has(id)) {
        index += 1;
        id = `${base}${index}`;
    }
    return id;
}

function nextCompilerSceneSlotName(nodes: readonly CompilerSceneTemplateNode[]) {
    const slots = collectCompilerSceneSlotNames(nodes);
    let index = 1;
    let name = 'slot1';
    while (slots.has(name)) {
        index += 1;
        name = `slot${index}`;
    }
    return name;
}

function collectCompilerSceneNodeIds(nodes: readonly CompilerSceneTemplateNode[], ids = new Set<string>()) {
    for (const node of nodes) {
        if (node.kind === 'slotOutlet') {
            continue;
        }
        if (node.id) {
            ids.add(node.id);
        }
        if (node.kind === 'pixi') {
            collectCompilerSceneNodeIds(node.children, ids);
            continue;
        }
        for (const children of Object.values(node.slots)) {
            collectCompilerSceneNodeIds(children, ids);
        }
    }
    return ids;
}

function collectCompilerSceneSlotNames(nodes: readonly CompilerSceneTemplateNode[], names = new Set<string>()) {
    for (const node of nodes) {
        if (node.kind === 'slotOutlet') {
            names.add(node.name);
            continue;
        }
        if (node.kind === 'pixi') {
            collectCompilerSceneSlotNames(node.children, names);
            continue;
        }
        for (const children of Object.values(node.slots)) {
            collectCompilerSceneSlotNames(children, names);
        }
    }
    return names;
}

function isDirectCompilerSlotLocator(ownerLocator: string, locator: string) {
    const prefix = `${ownerLocator}/slot:`;
    if (!locator.startsWith(prefix)) {
        return false;
    }
    return !locator.slice(prefix.length).includes('/');
}

function compilerSlotName(ownerLocator: string, locator: string) {
    return locator.slice(`${ownerLocator}/slot:`.length);
}

function sceneInstanceHasSlot(node: Extract<CompilerSceneTemplateNode, { kind: 'sceneInstance' }>, slot: string) {
    return document?.sceneInterfaces[node.scene]?.slots[slot] !== undefined
        || node.slots[slot] !== undefined;
}

function canInsertCompilerSceneNodeIntoParent(parentLocator: string, node: CompilerSceneTemplateNode) {
    return parentLocator !== '__scene__' || node.kind !== 'slotOutlet';
}

function normalizeCompilerSlotName(value: string) {
    return value.trim() || 'default';
}

function insertCompilerSceneNode(
    nodes: CompilerSceneTemplateNode[],
    parentLocator: string,
    node: CompilerSceneTemplateNode,
    path = '',
): { locator: string } | undefined {
    if (!path && parentLocator === '__scene__') {
        if (!canInsertCompilerSceneNodeIntoParent(parentLocator, node)) {
            return undefined;
        }
        const index = nodes.length;
        nodes.push(node);
        return { locator: compilerSceneNodeLocator(node, String(index)) };
    }

    for (const [index, parent] of nodes.entries()) {
        const nodePath = path ? `${path}/${index}` : String(index);
        const nodeLocator = compilerSceneNodeLocator(parent, nodePath);
        if (nodeLocator === parentLocator) {
            if (parent.kind !== 'pixi' || !pixiSceneNodeAcceptsChildren(parent.type)) {
                return undefined;
            }
            if (!canInsertCompilerSceneNodeIntoParent(parentLocator, node)) {
                return undefined;
            }
            const childIndex = parent.children.length;
            parent.children.push(node);
            return { locator: compilerSceneNodeLocator(node, `${nodeLocator}/${childIndex}`) };
        }
        if (parent.kind === 'pixi') {
            const inserted = insertCompilerSceneNode(parent.children, parentLocator, node, nodeLocator);
            if (inserted) {
                return inserted;
            }
            continue;
        }
        if (parent.kind === 'sceneInstance') {
            if (isDirectCompilerSlotLocator(nodeLocator, parentLocator)) {
                if (node.kind === 'slotOutlet') {
                    return undefined;
                }
                const slot = compilerSlotName(nodeLocator, parentLocator);
                if (!sceneInstanceHasSlot(parent, slot)) {
                    return undefined;
                }
                const children = parent.slots[slot] ?? [];
                parent.slots[slot] = children;
                const childIndex = children.length;
                children.push(node);
                return { locator: compilerSceneNodeLocator(node, `${parentLocator}/${childIndex}`) };
            }
            for (const [slot, children] of Object.entries(parent.slots)) {
                const inserted = insertCompilerSceneNode(children, parentLocator, node, `${nodeLocator}/slot:${slot}`);
                if (inserted) {
                    return inserted;
                }
            }
        }
    }
    return undefined;
}

interface CompilerSceneNodeLocation {
    acceptsSlotOutlet: boolean;
    index: number;
    locator: string;
    node: CompilerSceneTemplateNode;
    nodes: CompilerSceneTemplateNode[];
}

interface CompilerSceneChildList {
    acceptsSlotOutlet: boolean;
    index: number;
    nodes: CompilerSceneTemplateNode[];
}

function childCompilerSceneNodeLocator(parentLocator: string, node: CompilerSceneTemplateNode, index: number) {
    return compilerSceneNodeLocator(node, parentLocator === '__scene__' ? String(index) : `${parentLocator}/${index}`);
}

function findCompilerSceneNodeLocation(
    nodes: CompilerSceneTemplateNode[],
    locator: string,
    parentLocator = '__scene__',
    acceptsSlotOutlet = false,
): CompilerSceneNodeLocation | undefined {
    for (const [index, node] of nodes.entries()) {
        const nodeLocator = childCompilerSceneNodeLocator(parentLocator, node, index);
        if (nodeLocator === locator) {
            return {
                acceptsSlotOutlet,
                index,
                locator: nodeLocator,
                node,
                nodes,
            };
        }
        if (node.kind === 'pixi') {
            const found = findCompilerSceneNodeLocation(node.children, locator, nodeLocator, pixiSceneNodeAcceptsChildren(node.type));
            if (found) {
                return found;
            }
            continue;
        }
        if (node.kind === 'sceneInstance') {
            for (const [slot, children] of Object.entries(node.slots)) {
                const found = findCompilerSceneNodeLocation(children, locator, `${nodeLocator}/slot:${slot}`, false);
                if (found) {
                    return found;
                }
            }
        }
    }
    return undefined;
}

function findCompilerSceneChildList(
    nodes: CompilerSceneTemplateNode[],
    targetLocator: string,
    parentLocator = '__scene__',
): CompilerSceneChildList | undefined {
    if (parentLocator === '__scene__' && targetLocator === '__scene__') {
        return {
            acceptsSlotOutlet: false,
            index: nodes.length,
            nodes,
        };
    }

    for (const [index, node] of nodes.entries()) {
        const nodeLocator = childCompilerSceneNodeLocator(parentLocator, node, index);
        if (node.kind === 'pixi') {
            if (nodeLocator === targetLocator) {
                return pixiSceneNodeAcceptsChildren(node.type)
                    ? {
                        acceptsSlotOutlet: true,
                        index: node.children.length,
                        nodes: node.children,
                    }
                    : undefined;
            }
            const found = findCompilerSceneChildList(node.children, targetLocator, nodeLocator);
            if (found) {
                return found;
            }
            continue;
        }
        if (node.kind === 'sceneInstance') {
            if (isDirectCompilerSlotLocator(nodeLocator, targetLocator)) {
                const slot = compilerSlotName(nodeLocator, targetLocator);
                if (!sceneInstanceHasSlot(node, slot)) {
                    return undefined;
                }
                const children = node.slots[slot] ?? [];
                node.slots[slot] = children;
                return {
                    acceptsSlotOutlet: false,
                    index: children.length,
                    nodes: children,
                };
            }
            for (const [slot, children] of Object.entries(node.slots)) {
                const found = findCompilerSceneChildList(children, targetLocator, `${nodeLocator}/slot:${slot}`);
                if (found) {
                    return found;
                }
            }
        }
    }
    return undefined;
}

function findCompilerSceneSiblingTarget(
    nodes: CompilerSceneTemplateNode[],
    targetLocator: string,
    position: Exclude<CompilerSceneNodeDropPosition, 'inside'>,
) {
    const target = findCompilerSceneNodeLocation(nodes, targetLocator);
    if (!target) {
        return undefined;
    }
    return {
        acceptsSlotOutlet: target.acceptsSlotOutlet,
        index: target.index + (position === 'after' ? 1 : 0),
        nodes: target.nodes,
    };
}

function findCompilerSceneNodeLocator(
    nodes: readonly CompilerSceneTemplateNode[],
    target: CompilerSceneTemplateNode,
    parentLocator = '__scene__',
): string | undefined {
    for (const [index, node] of nodes.entries()) {
        const nodeLocator = childCompilerSceneNodeLocator(parentLocator, node, index);
        if (node === target) {
            return nodeLocator;
        }
        if (node.kind === 'pixi') {
            const found = findCompilerSceneNodeLocator(node.children, target, nodeLocator);
            if (found) {
                return found;
            }
            continue;
        }
        if (node.kind === 'sceneInstance') {
            for (const [slot, children] of Object.entries(node.slots)) {
                const found = findCompilerSceneNodeLocator(children, target, `${nodeLocator}/slot:${slot}`);
                if (found) {
                    return found;
                }
            }
        }
    }
    return undefined;
}

function removeCompilerSceneNode(
    nodes: CompilerSceneTemplateNode[],
    locator: string,
    parentSelection: CompilerSceneSelection,
    path = '',
): { selection: CompilerSceneSelection } | undefined {
    for (const [index, node] of nodes.entries()) {
        const nodePath = path ? `${path}/${index}` : String(index);
        const nodeLocator = compilerSceneNodeLocator(node, nodePath);
        if (nodeLocator === locator) {
            nodes.splice(index, 1);
            return { selection: parentSelection };
        }
        if (node.kind === 'pixi') {
            const removed = removeCompilerSceneNode(node.children, locator, { type: 'node', node: nodeLocator }, nodeLocator);
            if (removed) {
                return removed;
            }
            continue;
        }
        if (node.kind === 'sceneInstance') {
            for (const [slot, children] of Object.entries(node.slots)) {
                const slotLocator = `${nodeLocator}/slot:${slot}`;
                const removed = removeCompilerSceneNode(children, locator, { type: 'node', node: slotLocator }, slotLocator);
                if (removed) {
                    return removed;
                }
            }
        }
    }
    return undefined;
}

function updateCompilerSceneNodes(
    nodes: CompilerSceneTemplateNode[],
    locator: string,
    updates: {
        id?: string;
        slotName?: string;
        events?: Record<string, string | undefined>;
        props?: Record<string, SceneTemplateValue | undefined>;
    },
    path = '',
): { locator: string } | undefined {
    for (const [index, node] of nodes.entries()) {
        const nodePath = path ? `${path}/${index}` : String(index);
        const nodeLocator = compilerSceneNodeLocator(node, nodePath);
        if (nodeLocator === locator) {
            updateCompilerSceneNodeData(node, updates);
            return { locator: compilerSceneNodeLocator(node, nodePath) };
        }
        if (node.kind === 'pixi') {
            const updated = updateCompilerSceneNodes(node.children, locator, updates, nodeLocator);
            if (updated) {
                return updated;
            }
        }
        if (node.kind === 'sceneInstance') {
            for (const [slot, children] of Object.entries(node.slots)) {
                const updated = updateCompilerSceneNodes(children, locator, updates, `${nodeLocator}/slot:${slot}`);
                if (updated) {
                    return updated;
                }
            }
        }
    }
    return undefined;
}

function updateCompilerSceneNodeData(
    node: CompilerSceneTemplateNode,
    updates: {
        id?: string;
        slotName?: string;
        events?: Record<string, string | undefined>;
        props?: Record<string, SceneTemplateValue | undefined>;
    },
) {
    if (node.kind === 'slotOutlet') {
        if (updates.slotName !== undefined) {
            node.name = normalizeCompilerSlotName(updates.slotName);
        }
        return;
    }
    if (updates.id !== undefined) {
        node.id = updates.id.trim() || undefined;
    }
    for (const [key, value] of Object.entries(updates.props ?? {})) {
        if (value === undefined) {
            delete node.props[key];
        } else {
            node.props[key] = value;
        }
    }
    if (node.kind === 'sceneInstance') {
        for (const [key, value] of Object.entries(updates.events ?? {})) {
            if (value === undefined) {
                delete node.events[key];
            } else {
                node.events[key] = value;
            }
        }
    }
}
