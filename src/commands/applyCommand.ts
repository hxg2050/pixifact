import type { NodeSpec, PrefabSpec } from "../prefab";
import type { EditorCommand } from "./Command";
import { validateCommand } from "./validateCommand";
import type { CommandValidationContext } from "./validateCommand";
import { cloneValue, findComponent, findNode } from "./utils";

export type CommandResult =
    | { ok: true; command: EditorCommand; inverse: EditorCommand }
    | { ok: false; command: EditorCommand; error: string };

function applySetTransform(prefab: PrefabSpec, command: Extract<EditorCommand, { op: 'setTransform' }>): EditorCommand {
    const located = findNode(prefab, command.node)!;
    const previous: Record<string, unknown> = {};
    const transform = located.node.transform ?? {};

    for (const key of Object.keys(command.values) as Array<keyof typeof command.values>) {
        previous[key] = transform[key];
    }

    located.node.transform = { ...transform };
    for (const [key, value] of Object.entries(command.values)) {
        if (value === undefined) {
            delete (located.node.transform as Record<string, unknown>)[key];
        } else {
            (located.node.transform as Record<string, unknown>)[key] = value;
        }
    }

    return {
        op: 'setTransform',
        node: command.node,
        values: previous,
    };
}

function applySetNodeProp(prefab: PrefabSpec, command: Extract<EditorCommand, { op: 'setNodeProp' }>): EditorCommand {
    const located = findNode(prefab, command.node)!;
    const previous = located.node[command.prop];

    if (command.value === undefined) {
        delete located.node[command.prop];
    } else {
        located.node[command.prop] = command.value;
    }

    return {
        op: 'setNodeProp',
        node: command.value ?? command.node,
        prop: command.prop,
        value: previous,
    };
}

function applySetComponentProp(prefab: PrefabSpec, command: Extract<EditorCommand, { op: 'setComponentProp' }>): EditorCommand {
    const locatedNode = findNode(prefab, command.node)!;
    const locatedComponent = findComponent(locatedNode.node, command.component)!;
    const props = locatedComponent.component.props ?? {};
    const previous = props[command.prop];

    locatedComponent.component.props = { ...props };
    if (command.value === undefined) {
        delete locatedComponent.component.props[command.prop];
    } else {
        locatedComponent.component.props[command.prop] = cloneValue(command.value);
    }

    return {
        op: 'setComponentProp',
        node: command.node,
        component: command.component,
        prop: command.prop,
        value: previous,
    };
}

function applyAddComponent(prefab: PrefabSpec, command: Extract<EditorCommand, { op: 'addComponent' }>): EditorCommand {
    const locatedNode = findNode(prefab, command.node)!;
    const components = locatedNode.node.components ?? [];
    const index = command.index ?? components.length;

    components.splice(index, 0, cloneValue(command.component));
    locatedNode.node.components = components;

    return {
        op: 'removeComponent',
        node: command.node,
        component: command.component.id ?? command.component.type,
    };
}

function applyRemoveComponent(prefab: PrefabSpec, command: Extract<EditorCommand, { op: 'removeComponent' }>): EditorCommand {
    const locatedNode = findNode(prefab, command.node)!;
    const locatedComponent = findComponent(locatedNode.node, command.component)!;
    const components = locatedNode.node.components ?? [];
    const [removed] = components.splice(locatedComponent.index, 1);
    locatedNode.node.components = components;

    return {
        op: 'addComponent',
        node: command.node,
        component: cloneValue(removed),
        index: locatedComponent.index,
    };
}

function applyCreateNode(prefab: PrefabSpec, command: Extract<EditorCommand, { op: 'createNode' }>): EditorCommand {
    const children = command.parent
        ? (findNode(prefab, command.parent)!.node.children ??= [])
        : (prefab.root.children ??= []);
    const index = command.index ?? children.length;

    children.splice(index, 0, cloneValue(command.node));

    return {
        op: 'deleteNode',
        node: command.node.id ?? command.node.key ?? command.node.name ?? '',
    };
}

function applyDeleteNode(prefab: PrefabSpec, command: Extract<EditorCommand, { op: 'deleteNode' }>): EditorCommand {
    const located = findNode(prefab, command.node)!;
    const siblings = located.parent?.children ?? [];
    const [removed] = siblings.splice(located.index, 1);

    return {
        op: 'createNode',
        parent: located.parent?.id ?? located.parent?.key ?? located.parent?.name,
        node: cloneValue(removed as NodeSpec),
        index: located.index,
    };
}

function nodeLocator(node: NodeSpec) {
    return node.id ?? node.key ?? node.name ?? '';
}

function applyReparentNode(prefab: PrefabSpec, command: Extract<EditorCommand, { op: 'reparentNode' }>): EditorCommand {
    const located = findNode(prefab, command.node)!;
    const previousParent = located.parent;
    const previousIndex = located.index;
    const oldSiblings = previousParent?.children ?? [];
    const [node] = oldSiblings.splice(previousIndex, 1);
    const nextParent = command.parent ? findNode(prefab, command.parent)!.node : prefab.root;
    const nextSiblings = nextParent.children ??= [];
    const index = Math.min(command.index ?? nextSiblings.length, nextSiblings.length);

    nextSiblings.splice(index, 0, node as NodeSpec);

    return {
        op: 'reparentNode',
        node: command.node,
        parent: previousParent ? nodeLocator(previousParent) : undefined,
        index: previousIndex,
    };
}

function applyReorderNode(prefab: PrefabSpec, command: Extract<EditorCommand, { op: 'reorderNode' }>): EditorCommand {
    const located = findNode(prefab, command.node)!;
    const siblings = located.parent!.children ?? [];
    const previousIndex = located.index;
    const [node] = siblings.splice(previousIndex, 1);
    const index = Math.min(command.index, siblings.length);

    siblings.splice(index, 0, node as NodeSpec);

    return {
        op: 'reorderNode',
        node: command.node,
        index: previousIndex,
    };
}

function applyBatch(prefab: PrefabSpec, command: Extract<EditorCommand, { op: 'batch' }>, context: CommandValidationContext): CommandResult {
    const inverseCommands: EditorCommand[] = [];

    for (const child of command.commands) {
        const result = applyCommand(prefab, child, context);
        if (!result.ok) {
            for (let i = inverseCommands.length - 1; i >= 0; i--) {
                applyCommand(prefab, inverseCommands[i], context);
            }
            return {
                ok: false,
                command,
                error: result.error,
            };
        }
        inverseCommands.push(result.inverse);
    }

    return {
        ok: true,
        command,
        inverse: {
            op: 'batch',
            commands: [...inverseCommands].reverse(),
        },
    };
}

export function applyCommand(prefab: PrefabSpec, command: EditorCommand, context: CommandValidationContext = {}): CommandResult {
    const validation = validateCommand(prefab, command, context);
    if (!validation.ok) {
        return {
            ok: false,
            command,
            error: validation.error ?? 'Command validation failed.',
        };
    }

    let inverse: EditorCommand;
    switch (command.op) {
        case 'setNodeProp':
            inverse = applySetNodeProp(prefab, command);
            break;
        case 'setTransform':
            inverse = applySetTransform(prefab, command);
            break;
        case 'setComponentProp':
            inverse = applySetComponentProp(prefab, command);
            break;
        case 'addComponent':
            inverse = applyAddComponent(prefab, command);
            break;
        case 'removeComponent':
            inverse = applyRemoveComponent(prefab, command);
            break;
        case 'createNode':
            inverse = applyCreateNode(prefab, command);
            break;
        case 'deleteNode':
            inverse = applyDeleteNode(prefab, command);
            break;
        case 'reparentNode':
            inverse = applyReparentNode(prefab, command);
            break;
        case 'reorderNode':
            inverse = applyReorderNode(prefab, command);
            break;
        case 'batch':
            return applyBatch(prefab, command, context);
    }

    return {
        ok: true,
        command,
        inverse,
    };
}
