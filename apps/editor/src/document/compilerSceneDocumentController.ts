import type { SceneTemplate, SceneTemplateInterface, SceneTemplateValue } from '../../../../packages/pixifact/src/compiler/spec';
import { resolveSceneReference } from '../../../../packages/pixifact/src/compiler/sceneAssetPair';
import { pixiSceneNodeAcceptsChildren, pixiSceneNodeDefaults } from '../../../../packages/pixifact/src/compiler/pixiNodeSchema';
import type { PixiSceneNodeType } from '../../../../packages/pixifact/src/compiler/pixiNodeSchema';
import { CompilerSceneCommandStack } from '../../../../packages/pixifact/src/compiler/commands';
import type {
    CompilerSceneCommand,
    CompilerSceneCommandStackOptions,
    CompilerSceneCommandContext,
} from '../../../../packages/pixifact/src/compiler/commands';
import type {
    CompilerSceneScriptInterface,
    CompilerSceneTemplateNode,
} from '../services/projectFileTree';
import { pixiNodeTypeFromTemplateKind } from '../services/nodeTemplateLibrary';

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
const commandStack = new CompilerSceneCommandStack();
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

function compilerSceneCommandContext(nextDocument: CompilerSceneDocument): CompilerSceneCommandContext {
    const sceneInterfaces = { ...nextDocument.sceneInterfaces };
    if (nextDocument.descriptor?.scene) {
        collectCompilerSceneResolvedInterfaces(nextDocument.template.children, nextDocument.descriptor.scene, sceneInterfaces);
    }
    return { sceneInterfaces };
}

function collectCompilerSceneResolvedInterfaces(
    nodes: readonly CompilerSceneTemplateNode[],
    ownerScenePath: string,
    sceneInterfaces: Record<string, SceneTemplateInterface>,
) {
    for (const node of nodes) {
        if (node.kind === 'pixi') {
            collectCompilerSceneResolvedInterfaces(node.children, ownerScenePath, sceneInterfaces);
            continue;
        }
        if (node.kind !== 'sceneInstance') {
            continue;
        }
        const resolvedScenePath = resolveSceneReference(ownerScenePath, node.scene);
        if (!sceneInterfaces[node.scene] && sceneInterfaces[resolvedScenePath]) {
            sceneInterfaces[node.scene] = sceneInterfaces[resolvedScenePath];
        }
        for (const children of Object.values(node.slots)) {
            collectCompilerSceneResolvedInterfaces(children, ownerScenePath, sceneInterfaces);
        }
    }
}

function compilerSceneCommand(commands: CompilerSceneCommand[]) {
    if (commands.length === 0) {
        return undefined;
    }
    if (commands.length === 1) {
        return commands[0];
    }
    return {
        op: 'batch',
        commands,
    } satisfies CompilerSceneCommand;
}

function executeCompilerSceneDocumentCommand(
    command: CompilerSceneCommand,
    options: CompilerSceneCommandStackOptions = {},
    updates: Partial<Pick<CompilerSceneDocument, 'sceneInterfaces'>> = {},
) {
    if (!document) {
        return {
            ok: false as const,
            command,
            error: '未打开 Compiler Scene。',
        };
    }
    const current = document;
    const template = structuredClone(current.template);
    const nextDocument = {
        ...current,
        ...updates,
        template,
    };
    const result = commandStack.execute(template, command, options, compilerSceneCommandContext(nextDocument));
    if (!result.ok) {
        return result;
    }
    document = {
        ...nextDocument,
        selection: result.selection ?? current.selection,
        dirty: commandStack.dirty,
    };
    emitCompilerSceneUpdate();
    return result;
}

export function loadCompilerSceneDocument(next: Omit<CompilerSceneDocument, 'selection' | 'dirty'>) {
    commandStack.clear();
    document = {
        ...next,
        selection: { type: 'scene' },
        dirty: false,
    };
    emitCompilerSceneUpdate();
}

export function closeCompilerSceneDocument() {
    commandStack.clear();
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

export function selectCompilerSceneRoot() {
    if (!document) {
        return;
    }
    document = {
        ...document,
        selection: { type: 'scene' },
    };
    emitCompilerSceneUpdate();
}

export function updateCompilerSceneTemplate(updates: {
    name?: string;
    props?: Record<string, SceneTemplateValue | undefined>;
}, options: CompilerSceneCommandStackOptions = {}) {
    const commands: CompilerSceneCommand[] = [];
    if (updates.name !== undefined) {
        commands.push({
            op: 'setSceneName',
            value: updates.name,
        });
    }
    for (const [key, value] of Object.entries(updates.props ?? {})) {
        commands.push({
            op: 'setSceneProp',
            prop: key,
            value,
        });
    }
    const command = compilerSceneCommand(commands);
    if (!command) {
        return;
    }
    executeCompilerSceneDocumentCommand(command, options);
}

export function refreshCompilerSceneDescriptor(descriptor: CompilerSceneScriptInterface) {
    if (!document) {
        return;
    }
    document = {
        ...document,
        descriptor,
        template: {
            ...document.template,
            interface: descriptor.interface,
        },
    };
    emitCompilerSceneUpdate();
}

export function refreshCompilerSceneBindingSnapshot(updates: {
    descriptor: CompilerSceneScriptInterface;
    sceneInterfaces: Record<string, SceneTemplateInterface>;
}) {
    if (!document) {
        return;
    }
    if (
        JSON.stringify(document.descriptor) === JSON.stringify(updates.descriptor)
        && JSON.stringify(document.sceneInterfaces) === JSON.stringify(updates.sceneInterfaces)
        && JSON.stringify(document.template.interface) === JSON.stringify(updates.descriptor.interface)
    ) {
        return;
    }
    document = {
        ...document,
        descriptor: updates.descriptor,
        sceneInterfaces: updates.sceneInterfaces,
        template: {
            ...document.template,
            interface: updates.descriptor.interface,
        },
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
    options: CompilerSceneCommandStackOptions = {},
) {
    const commands: CompilerSceneCommand[] = [];
    for (const [key, value] of Object.entries(updates.props ?? {})) {
        commands.push({
            op: 'setNodeProp',
            node: locator,
            prop: key,
            value,
        });
    }
    for (const [key, value] of Object.entries(updates.events ?? {})) {
        commands.push({
            op: 'setNodeEvent',
            node: locator,
            event: key,
            value,
        });
    }
    if (updates.id !== undefined) {
        commands.push({
            op: 'setNodeId',
            node: locator,
            value: updates.id,
        });
    }
    if (updates.slotName !== undefined) {
        commands.push({
            op: 'renameSlotOutlet',
            node: locator,
            name: updates.slotName,
        });
    }
    const command = compilerSceneCommand(commands);
    if (!command) {
        return;
    }
    executeCompilerSceneDocumentCommand(command, options);
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

export function compilerPixiTypeFromNodeTemplate(kind: string): CompilerSceneAddablePixiType | undefined {
    return pixiNodeTypeFromTemplateKind(kind);
}

export function createCompilerSceneInstanceTemplateNode(
    template: SceneTemplate,
    scene: SceneTemplate,
    scenePath: string,
    sceneInterface: SceneTemplateInterface = scene.interface,
    className = scene.name,
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

export function createCompilerSlotOutletTemplateNode(template: SceneTemplate): CompilerSceneTemplateNode {
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
    className = scene.name,
) {
    if (!document) {
        return {
            ok: false as const,
            error: '未打开 Compiler Scene。',
        };
    }

    const node = createCompilerSceneInstanceTemplateNode(document.template, scene, scenePath, sceneInterface, className);
    const sceneInterfaces = {
        ...document.sceneInterfaces,
        [scenePath]: sceneInterface,
    };
    const result = executeCompilerSceneDocumentCommand({
        op: 'insertNode',
        parent: parentLocator,
        node,
    }, {}, {
        sceneInterfaces,
    });
    if (!result.ok) {
        return {
            ok: false as const,
            error: '当前选择不能包含子节点。',
        };
    }

    return {
        ok: true as const,
        locator: result.selection?.type === 'node' ? result.selection.node : parentLocator,
    };
}

export function addCompilerSceneNode(parentLocator: string, node: CompilerSceneTemplateNode) {
    if (!document) {
        return {
            ok: false as const,
            error: '未打开 Compiler Scene。',
        };
    }

    const result = executeCompilerSceneDocumentCommand({
        op: 'insertNode',
        parent: parentLocator,
        node,
    });
    if (!result.ok) {
        return {
            ok: false as const,
            error: '当前选择不能包含子节点。',
        };
    }

    return {
        ok: true as const,
        locator: result.selection?.type === 'node' ? result.selection.node : parentLocator,
    };
}

export function addCompilerSceneNodeAtTarget(targetLocator: string, node: CompilerSceneTemplateNode) {
    if (!document) {
        return {
            ok: false as const,
            error: '未打开 Compiler Scene。',
        };
    }

    const template = structuredClone(document.template);
    const target = findCompilerSceneChildList(template.children, targetLocator)
        ? { parent: targetLocator }
        : findCompilerSceneNodeLocation(template.children, targetLocator);
    const command = target && 'parent' in target
        ? {
            op: 'insertNode',
            parent: target.parent,
            node,
        } satisfies CompilerSceneCommand
        : target
            ? {
                op: 'insertNode',
                parent: target.parentLocator,
                index: target.index + 1,
                node,
            } satisfies CompilerSceneCommand
            : undefined;
    if (!command) {
        return {
            ok: false as const,
            error: '当前选择不能包含子节点。',
        };
    }

    const result = executeCompilerSceneDocumentCommand(command);
    if (!result.ok) {
        return {
            ok: false as const,
            error: '当前选择不能包含子节点。',
        };
    }

    return {
        ok: true as const,
        locator: result.selection?.type === 'node' ? result.selection.node : targetLocator,
    };
}

export function deleteCompilerSceneNode(locator: string) {
    if (!document) {
        return {
            ok: false as const,
            error: '未打开 Compiler Scene。',
        };
    }

    const result = executeCompilerSceneDocumentCommand({
        op: 'deleteNode',
        node: locator,
    });
    if (!result.ok) {
        return {
            ok: false as const,
            error: '当前选择不能删除。',
        };
    }

    return {
        ok: true as const,
        selection: result.selection ?? { type: 'scene' },
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

    const result = executeCompilerSceneDocumentCommand({
        op: 'moveNode',
        node: sourceLocator,
        parent: target.parentLocator,
        index: target.index,
    });
    if (!result.ok) {
        return {
            ok: false as const,
            error: '目标位置不能接收该节点。',
        };
    }

    return {
        ok: true as const,
        locator: result.selection?.type === 'node' ? result.selection.node : target.parentLocator,
    };
}

export function markCompilerSceneSaved() {
    if (!document) {
        return;
    }
    commandStack.markSaved();
    document = {
        ...document,
        dirty: commandStack.dirty,
    };
    emitCompilerSceneUpdate();
}

export function canUndoCompilerSceneCommand() {
    return Boolean(document) && commandStack.canUndo;
}

export function canRedoCompilerSceneCommand() {
    return Boolean(document) && commandStack.canRedo;
}

export function undoCompilerSceneCommand() {
    if (!document) {
        return;
    }
    const current = document;
    const template = structuredClone(current.template);
    const result = commandStack.undo(template, compilerSceneCommandContext(current));
    if (!result?.ok) {
        return result;
    }
    document = {
        ...current,
        template,
        selection: result.selection ?? current.selection,
        dirty: commandStack.dirty,
    };
    emitCompilerSceneUpdate();
    return result;
}

export function redoCompilerSceneCommand() {
    if (!document) {
        return;
    }
    const current = document;
    const template = structuredClone(current.template);
    const result = commandStack.redo(template, compilerSceneCommandContext(current));
    if (!result?.ok) {
        return result;
    }
    document = {
        ...current,
        template,
        selection: result.selection ?? current.selection,
        dirty: commandStack.dirty,
    };
    emitCompilerSceneUpdate();
    return result;
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
    return sceneInterfaceForInstance(node)?.slots[slot] !== undefined
        || node.slots[slot] !== undefined;
}

function sceneInterfaceForInstance(node: Extract<CompilerSceneTemplateNode, { kind: 'sceneInstance' }>) {
    if (!document) {
        return undefined;
    }
    if (document.sceneInterfaces[node.scene]) {
        return document.sceneInterfaces[node.scene];
    }
    if (!document.descriptor?.scene) {
        return undefined;
    }
    return document.sceneInterfaces[resolveSceneReference(document.descriptor.scene, node.scene)];
}

interface CompilerSceneNodeLocation {
    acceptsSlotOutlet: boolean;
    index: number;
    locator: string;
    node: CompilerSceneTemplateNode;
    nodes: CompilerSceneTemplateNode[];
    parentLocator: string;
}

interface CompilerSceneChildList {
    acceptsSlotOutlet: boolean;
    index: number;
    nodes: CompilerSceneTemplateNode[];
    parentLocator: string;
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
                parentLocator,
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
            parentLocator: '__scene__',
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
                        parentLocator: nodeLocator,
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
                    parentLocator: targetLocator,
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
        parentLocator: target.parentLocator,
    };
}
