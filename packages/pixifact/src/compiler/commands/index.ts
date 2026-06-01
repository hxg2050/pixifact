import { pixiSceneNodeAcceptsChildren } from '../pixiNodeSchema';
import type {
    SceneInstanceTemplateNode,
    SceneTemplate,
    SceneTemplateInterface,
    SceneTemplateNode,
    SceneTemplateValue,
    SlotOutletTemplateNode,
} from '../spec';

export type CompilerSceneSelection =
    | { type: 'scene' }
    | { type: 'node'; node: string };

export type CompilerSceneCommand =
    | { op: 'setSceneName'; value: string }
    | { op: 'setSceneProp'; prop: string; value?: SceneTemplateValue }
    | { op: 'setNodeId'; node: string; value?: string }
    | { op: 'setNodeProp'; node: string; prop: string; value?: SceneTemplateValue }
    | { op: 'setNodeEvent'; node: string; event: string; value?: string }
    | { op: 'renameSlotOutlet'; node: string; name: string }
    | { op: 'insertNode'; parent: string; index?: number; node: SceneTemplateNode }
    | { op: 'deleteNode'; node: string }
    | { op: 'moveNode'; node: string; parent: string; index: number }
    | { op: 'batch'; commands: CompilerSceneCommand[] };

export type CompilerSceneCommandResult =
    | {
        ok: true;
        command: CompilerSceneCommand;
        inverse: CompilerSceneCommand;
        selection?: CompilerSceneSelection;
    }
    | {
        ok: false;
        command: CompilerSceneCommand;
        error: string;
    };

export interface CompilerSceneCommandContext {
    sceneInterfaces?: Record<string, SceneTemplateInterface>;
}

export interface CompilerSceneCommandStackOptions {
    label?: string;
    mergeKey?: string;
}

interface CompilerSceneNodeLocation {
    acceptsSlotOutlet: boolean;
    index: number;
    locator: string;
    node: SceneTemplateNode;
    nodes: SceneTemplateNode[];
    parentLocator: string;
}

interface CompilerSceneChildList {
    acceptsSlotOutlet: boolean;
    index: number;
    nodes: SceneTemplateNode[];
    parentLocator: string;
}

interface CompilerSceneCommandStackEntry {
    afterRevision: number;
    beforeRevision: number;
    command: CompilerSceneCommand;
    inverse: CompilerSceneCommand;
    label?: string;
    mergeKey?: string;
}

function cloneNode(node: SceneTemplateNode) {
    return structuredClone(node) as SceneTemplateNode;
}

export function compilerSceneNodeLocator(node: SceneTemplateNode, path = '') {
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

function childCompilerSceneNodeLocator(parentLocator: string, node: SceneTemplateNode, index: number) {
    return compilerSceneNodeLocator(node, parentLocator === '__scene__' ? String(index) : `${parentLocator}/${index}`);
}

function normalizeSlotOutletName(value: string) {
    return value.trim() || 'default';
}

function sceneInstanceHasSlot(
    node: SceneInstanceTemplateNode,
    slot: string,
    context: CompilerSceneCommandContext,
) {
    return node.slots[slot] !== undefined
        || context.sceneInterfaces?.[node.scene]?.slots[slot] !== undefined;
}

function canInsertNodeIntoParent(parentLocator: string, child: SceneTemplateNode, acceptsSlotOutlet: boolean) {
    if (child.kind === 'slotOutlet') {
        return parentLocator !== '__scene__' && acceptsSlotOutlet;
    }
    return true;
}

function findCompilerSceneNodeLocation(
    nodes: SceneTemplateNode[],
    locator: string,
    context: CompilerSceneCommandContext,
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
            const found = findCompilerSceneNodeLocation(
                node.children,
                locator,
                context,
                nodeLocator,
                pixiSceneNodeAcceptsChildren(node.type),
            );
            if (found) {
                return found;
            }
            continue;
        }
        if (node.kind === 'sceneInstance') {
            for (const [slot, children] of Object.entries(node.slots)) {
                const found = findCompilerSceneNodeLocation(children, locator, context, `${nodeLocator}/slot:${slot}`, false);
                if (found) {
                    return found;
                }
            }
        }
    }
    return undefined;
}

function directSlotName(ownerLocator: string, locator: string) {
    const prefix = `${ownerLocator}/slot:`;
    if (!locator.startsWith(prefix)) {
        return undefined;
    }
    const rest = locator.slice(prefix.length);
    return rest.includes('/') ? undefined : rest;
}

function findCompilerSceneChildList(
    nodes: SceneTemplateNode[],
    parent: string,
    context: CompilerSceneCommandContext,
    parentLocator = '__scene__',
): CompilerSceneChildList | undefined {
    if (parentLocator === '__scene__' && parent === '__scene__') {
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
            if (nodeLocator === parent) {
                return pixiSceneNodeAcceptsChildren(node.type)
                    ? {
                        acceptsSlotOutlet: true,
                        index: node.children.length,
                        nodes: node.children,
                        parentLocator: nodeLocator,
                    }
                    : undefined;
            }
            const found = findCompilerSceneChildList(node.children, parent, context, nodeLocator);
            if (found) {
                return found;
            }
            continue;
        }
        if (node.kind === 'sceneInstance') {
            const slot = directSlotName(nodeLocator, parent);
            if (slot) {
                if (!sceneInstanceHasSlot(node, slot, context)) {
                    return undefined;
                }
                const children = node.slots[slot] ?? [];
                node.slots[slot] = children;
                return {
                    acceptsSlotOutlet: false,
                    index: children.length,
                    nodes: children,
                    parentLocator: parent,
                };
            }
            for (const [slotName, children] of Object.entries(node.slots)) {
                const found = findCompilerSceneChildList(children, parent, context, `${nodeLocator}/slot:${slotName}`);
                if (found) {
                    return found;
                }
            }
        }
    }
    return undefined;
}

function findCompilerSceneNodeLocator(
    nodes: readonly SceneTemplateNode[],
    target: SceneTemplateNode,
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

function setSceneName(template: SceneTemplate, command: Extract<CompilerSceneCommand, { op: 'setSceneName' }>): CompilerSceneCommandResult {
    const previous = template.name;
    template.name = command.value;
    return {
        ok: true,
        command,
        inverse: {
            op: 'setSceneName',
            value: previous,
        },
        selection: { type: 'scene' },
    };
}

function setSceneProp(template: SceneTemplate, command: Extract<CompilerSceneCommand, { op: 'setSceneProp' }>): CompilerSceneCommandResult {
    const previous = template.props[command.prop];
    if (command.value === undefined) {
        delete template.props[command.prop];
    } else {
        template.props[command.prop] = command.value;
    }
    return {
        ok: true,
        command,
        inverse: {
            op: 'setSceneProp',
            prop: command.prop,
            value: previous,
        },
        selection: { type: 'scene' },
    };
}

function setNodeId(
    template: SceneTemplate,
    command: Extract<CompilerSceneCommand, { op: 'setNodeId' }>,
    context: CompilerSceneCommandContext,
): CompilerSceneCommandResult {
    const located = findCompilerSceneNodeLocation(template.children, command.node, context);
    if (!located || located.node.kind === 'slotOutlet') {
        return { ok: false, command, error: 'Node was not found.' };
    }
    const previous = located.node.id;
    located.node.id = command.value?.trim() || undefined;
    const locator = childCompilerSceneNodeLocator(located.parentLocator, located.node, located.index);
    return {
        ok: true,
        command,
        inverse: {
            op: 'setNodeId',
            node: locator,
            value: previous,
        },
        selection: { type: 'node', node: locator },
    };
}

function setNodeProp(
    template: SceneTemplate,
    command: Extract<CompilerSceneCommand, { op: 'setNodeProp' }>,
    context: CompilerSceneCommandContext,
): CompilerSceneCommandResult {
    const located = findCompilerSceneNodeLocation(template.children, command.node, context);
    if (!located || located.node.kind === 'slotOutlet') {
        return { ok: false, command, error: 'Node was not found.' };
    }
    const previous = located.node.props[command.prop];
    if (command.value === undefined) {
        delete located.node.props[command.prop];
    } else {
        located.node.props[command.prop] = command.value;
    }
    return {
        ok: true,
        command,
        inverse: {
            op: 'setNodeProp',
            node: command.node,
            prop: command.prop,
            value: previous,
        },
        selection: { type: 'node', node: command.node },
    };
}

function setNodeEvent(
    template: SceneTemplate,
    command: Extract<CompilerSceneCommand, { op: 'setNodeEvent' }>,
    context: CompilerSceneCommandContext,
): CompilerSceneCommandResult {
    const located = findCompilerSceneNodeLocation(template.children, command.node, context);
    if (!located || located.node.kind !== 'sceneInstance') {
        return { ok: false, command, error: 'Node event target was not found.' };
    }
    const previous = located.node.events[command.event];
    if (command.value === undefined) {
        delete located.node.events[command.event];
    } else {
        located.node.events[command.event] = command.value;
    }
    return {
        ok: true,
        command,
        inverse: {
            op: 'setNodeEvent',
            node: command.node,
            event: command.event,
            value: previous,
        },
        selection: { type: 'node', node: command.node },
    };
}

function renameSlotOutlet(
    template: SceneTemplate,
    command: Extract<CompilerSceneCommand, { op: 'renameSlotOutlet' }>,
    context: CompilerSceneCommandContext,
): CompilerSceneCommandResult {
    const located = findCompilerSceneNodeLocation(template.children, command.node, context);
    if (!located || located.node.kind !== 'slotOutlet') {
        return { ok: false, command, error: 'Slot outlet was not found.' };
    }
    const previous = located.node.name;
    located.node.name = normalizeSlotOutletName(command.name);
    const locator = childCompilerSceneNodeLocator(located.parentLocator, located.node, located.index);
    return {
        ok: true,
        command,
        inverse: {
            op: 'renameSlotOutlet',
            node: locator,
            name: previous,
        },
        selection: { type: 'node', node: locator },
    };
}

function insertNode(
    template: SceneTemplate,
    command: Extract<CompilerSceneCommand, { op: 'insertNode' }>,
    context: CompilerSceneCommandContext,
): CompilerSceneCommandResult {
    const childList = findCompilerSceneChildList(template.children, command.parent, context);
    if (!childList || !canInsertNodeIntoParent(command.parent, command.node, childList.acceptsSlotOutlet)) {
        return { ok: false, command, error: 'Parent cannot contain this node.' };
    }
    const node = cloneNode(command.node);
    const index = Math.max(0, Math.min(command.index ?? childList.nodes.length, childList.nodes.length));
    childList.nodes.splice(index, 0, node);
    const locator = childCompilerSceneNodeLocator(command.parent, node, index);
    return {
        ok: true,
        command,
        inverse: {
            op: 'deleteNode',
            node: locator,
        },
        selection: { type: 'node', node: locator },
    };
}

function deleteNode(
    template: SceneTemplate,
    command: Extract<CompilerSceneCommand, { op: 'deleteNode' }>,
    context: CompilerSceneCommandContext,
): CompilerSceneCommandResult {
    const located = findCompilerSceneNodeLocation(template.children, command.node, context);
    if (!located) {
        return { ok: false, command, error: 'Node was not found.' };
    }
    const [removed] = located.nodes.splice(located.index, 1);
    return {
        ok: true,
        command,
        inverse: {
            op: 'insertNode',
            parent: located.parentLocator,
            index: located.index,
            node: cloneNode(removed),
        },
        selection: located.parentLocator === '__scene__'
            ? { type: 'scene' }
            : { type: 'node', node: located.parentLocator },
    };
}

function moveNode(
    template: SceneTemplate,
    command: Extract<CompilerSceneCommand, { op: 'moveNode' }>,
    context: CompilerSceneCommandContext,
): CompilerSceneCommandResult {
    if (command.parent === command.node || command.parent.startsWith(`${command.node}/`)) {
        return { ok: false, command, error: 'Cannot move a node into itself.' };
    }
    const source = findCompilerSceneNodeLocation(template.children, command.node, context);
    const target = findCompilerSceneChildList(template.children, command.parent, context);
    if (!source || !target || !canInsertNodeIntoParent(command.parent, source.node, target.acceptsSlotOutlet)) {
        return { ok: false, command, error: 'Target cannot contain this node.' };
    }

    const [node] = source.nodes.splice(source.index, 1);
    let index = Math.max(0, Math.min(command.index, target.nodes.length));
    if (source.nodes === target.nodes && source.index < index) {
        index -= 1;
    }
    target.nodes.splice(index, 0, node);
    const locator = findCompilerSceneNodeLocator(template.children, node);
    if (!locator) {
        throw new Error('Moved Compiler Scene node is missing from the template.');
    }

    return {
        ok: true,
        command,
        inverse: {
            op: 'moveNode',
            node: locator,
            parent: source.parentLocator,
            index: source.index,
        },
        selection: { type: 'node', node: locator },
    };
}

function applyBatch(
    template: SceneTemplate,
    command: Extract<CompilerSceneCommand, { op: 'batch' }>,
    context: CompilerSceneCommandContext,
): CompilerSceneCommandResult {
    const inverseCommands: CompilerSceneCommand[] = [];
    let selection: CompilerSceneSelection | undefined;

    for (const child of command.commands) {
        const result = applyCompilerSceneCommand(template, child, context);
        if (!result.ok) {
            for (let index = inverseCommands.length - 1; index >= 0; index--) {
                applyCompilerSceneCommand(template, inverseCommands[index], context);
            }
            return {
                ok: false,
                command,
                error: result.error,
            };
        }
        inverseCommands.push(result.inverse);
        selection = result.selection;
    }

    return {
        ok: true,
        command,
        inverse: {
            op: 'batch',
            commands: [...inverseCommands].reverse(),
        },
        selection,
    };
}

export function applyCompilerSceneCommand(
    template: SceneTemplate,
    command: CompilerSceneCommand,
    context: CompilerSceneCommandContext = {},
): CompilerSceneCommandResult {
    switch (command.op) {
        case 'setSceneName':
            return setSceneName(template, command);
        case 'setSceneProp':
            return setSceneProp(template, command);
        case 'setNodeId':
            return setNodeId(template, command, context);
        case 'setNodeProp':
            return setNodeProp(template, command, context);
        case 'setNodeEvent':
            return setNodeEvent(template, command, context);
        case 'renameSlotOutlet':
            return renameSlotOutlet(template, command, context);
        case 'insertNode':
            return insertNode(template, command, context);
        case 'deleteNode':
            return deleteNode(template, command, context);
        case 'moveNode':
            return moveNode(template, command, context);
        case 'batch':
            return applyBatch(template, command, context);
    }
}

export class CompilerSceneCommandStack {
    private undoStack: CompilerSceneCommandStackEntry[] = [];
    private redoStack: CompilerSceneCommandStackEntry[] = [];
    private currentRevision = 0;
    private savedRevision = 0;

    get canUndo() {
        return this.undoStack.length > 0;
    }

    get canRedo() {
        return this.redoStack.length > 0;
    }

    get dirty() {
        return this.currentRevision !== this.savedRevision;
    }

    execute(
        template: SceneTemplate,
        command: CompilerSceneCommand,
        options: CompilerSceneCommandStackOptions = {},
        context: CompilerSceneCommandContext = {},
    ) {
        const beforeRevision = this.currentRevision;
        const result = applyCompilerSceneCommand(template, command, context);
        if (!result.ok) {
            return result;
        }

        this.currentRevision += 1;
        const previous = this.undoStack[this.undoStack.length - 1];
        if (options.mergeKey && previous?.mergeKey === options.mergeKey) {
            previous.command = command;
            previous.afterRevision = this.currentRevision;
            previous.label = options.label ?? previous.label;
        } else {
            this.undoStack.push({
                afterRevision: this.currentRevision,
                beforeRevision,
                command,
                inverse: result.inverse,
                label: options.label,
                mergeKey: options.mergeKey,
            });
        }
        this.redoStack.length = 0;
        return result;
    }

    undo(template: SceneTemplate, context: CompilerSceneCommandContext = {}) {
        const entry = this.undoStack.pop();
        if (!entry) {
            return undefined;
        }
        const result = applyCompilerSceneCommand(template, entry.inverse, context);
        if (!result.ok) {
            this.undoStack.push(entry);
            return result;
        }
        this.currentRevision = entry.beforeRevision;
        this.redoStack.push(entry);
        return result;
    }

    redo(template: SceneTemplate, context: CompilerSceneCommandContext = {}) {
        const entry = this.redoStack.pop();
        if (!entry) {
            return undefined;
        }
        const result = applyCompilerSceneCommand(template, entry.command, context);
        if (!result.ok) {
            this.redoStack.push(entry);
            return result;
        }
        this.currentRevision = entry.afterRevision;
        this.undoStack.push(entry);
        return result;
    }

    markSaved() {
        this.savedRevision = this.currentRevision;
    }

    clear() {
        this.undoStack.length = 0;
        this.redoStack.length = 0;
        this.currentRevision = 0;
        this.savedRevision = 0;
    }
}
