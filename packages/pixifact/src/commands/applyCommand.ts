import type { NodeSpec, SceneSpec } from "../scene";
import type { SceneCommand } from "./Command";
import { validateCommand } from "./validateCommand";
import type { CommandValidationContext } from "./validateCommand";
import { cloneValue, findComponent, findNode } from "./utils";

export type CommandResult =
    | { ok: true; command: SceneCommand; inverse: SceneCommand }
    | { ok: false; command: SceneCommand; error: string };

export interface CommandFailureDetails {
    commandIndex?: number;
    op?: SceneCommand['op'];
    node?: string;
    target?: string;
    hint?: string;
}

export function hintForCommandError(error: string) {
    if (error.includes('inside projectRoot')) {
        return 'Use a project-relative scene path that stays inside projectRoot.';
    }
    if (error.includes('already exists')) {
        return 'Choose a different scene path or inspect the existing file before writing.';
    }
    if (error.includes('was not found')) {
        return 'Re-run scene get or node inspect to refresh locators before regenerating the command.';
    }
    if (error.includes('Only container nodes')) {
        return 'Choose a container node as the parent, or create a container template before adding children.';
    }
    if (error.includes('does not exist')) {
        return 'Verify that the field belongs to the target node or component schema before retrying.';
    }
    if (error.includes('expects')) {
        return 'Check the target schema and send a value with the expected type.';
    }
    return undefined;
}

function commandNode(command: SceneCommand) {
    switch (command.op) {
        case 'createNode':
            return nodeLocator(command.node);
        case 'batch':
            return undefined;
        default:
            return command.node;
    }
}

function commandTarget(command: SceneCommand) {
    switch (command.op) {
        case 'setNodeProp':
            return `${command.node}.${command.prop}`;
        case 'setTransform':
            return `${command.node}.transform`;
        case 'setNodeData':
            return `${command.node}.${command.field}.${command.prop}`;
        case 'setComponentProp':
            return `${command.node}.${command.component}.${command.prop}`;
        case 'addComponent':
            return `${command.node}.components.${command.component.id ?? command.component.type}`;
        case 'removeComponent':
            return `${command.node}.components.${command.component}`;
        case 'createNode':
            return `${command.parent ?? 'root'}.children`;
        case 'deleteNode':
            return command.node;
        case 'reparentNode':
            return `${command.node}.parent`;
        case 'reorderNode':
            return `${command.node}.index`;
        case 'batch':
            return 'batch.commands';
    }
}

export function commandFailureDetails(commands: SceneCommand[], results: CommandResult[], error: string | undefined): CommandFailureDetails {
    const failedResultIndex = results.findIndex((result) => !result.ok);
    const commandIndex = failedResultIndex >= 0
        ? failedResultIndex
        : Math.min(results.length, commands.length - 1);
    const command = commands[commandIndex];

    if (!command) {
        return {
            hint: error ? hintForCommandError(error) : undefined,
        };
    }

    return {
        commandIndex,
        op: command.op,
        node: commandNode(command),
        target: commandTarget(command),
        hint: error ? hintForCommandError(error) : undefined,
    };
}

function applySetTransform(scene: SceneSpec, command: Extract<SceneCommand, { op: 'setTransform' }>): SceneCommand {
    const located = findNode(scene, command.node)!;
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

function applySetNodeData(scene: SceneSpec, command: Extract<SceneCommand, { op: 'setNodeData' }>): SceneCommand {
    const located = findNode(scene, command.node)!;
    const nodeData = located.node as unknown as Record<string, Record<string, unknown> | undefined>;
    const current = nodeData[command.field] ?? {};
    const previous = current[command.prop];
    const next = { ...current };

    if (command.value === undefined) {
        delete next[command.prop];
    } else {
        next[command.prop] = cloneValue(command.value);
    }
    nodeData[command.field] = next;

    return {
        op: 'setNodeData',
        node: command.node,
        field: command.field,
        prop: command.prop,
        value: previous,
    };
}

function applySetNodeProp(scene: SceneSpec, command: Extract<SceneCommand, { op: 'setNodeProp' }>): SceneCommand {
    const located = findNode(scene, command.node)!;
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

function applySetComponentProp(scene: SceneSpec, command: Extract<SceneCommand, { op: 'setComponentProp' }>): SceneCommand {
    const locatedNode = findNode(scene, command.node)!;
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

function applyAddComponent(scene: SceneSpec, command: Extract<SceneCommand, { op: 'addComponent' }>): SceneCommand {
    const locatedNode = findNode(scene, command.node)!;
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

function applyRemoveComponent(scene: SceneSpec, command: Extract<SceneCommand, { op: 'removeComponent' }>): SceneCommand {
    const locatedNode = findNode(scene, command.node)!;
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

function applyCreateNode(scene: SceneSpec, command: Extract<SceneCommand, { op: 'createNode' }>): SceneCommand {
    const children = command.parent
        ? ((findNode(scene, command.parent)!.node as Extract<NodeSpec, { kind: 'container' }>).children ??= [])
        : (scene.root.children ??= []);
    const index = command.index ?? children.length;

    children.splice(index, 0, cloneValue(command.node));

    return {
        op: 'deleteNode',
        node: command.node.id ?? command.node.key ?? command.node.name ?? '',
    };
}

function applyDeleteNode(scene: SceneSpec, command: Extract<SceneCommand, { op: 'deleteNode' }>): SceneCommand {
    const located = findNode(scene, command.node)!;
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

function applyReparentNode(scene: SceneSpec, command: Extract<SceneCommand, { op: 'reparentNode' }>): SceneCommand {
    const located = findNode(scene, command.node)!;
    const previousParent = located.parent;
    const previousIndex = located.index;
    const oldSiblings = previousParent?.children ?? [];
    const [node] = oldSiblings.splice(previousIndex, 1);
    const nextParent = command.parent ? findNode(scene, command.parent)!.node : scene.root;
    const nextSiblings = (nextParent as Extract<NodeSpec, { kind: 'container' }>).children ??= [];
    const index = Math.min(command.index ?? nextSiblings.length, nextSiblings.length);

    nextSiblings.splice(index, 0, node as NodeSpec);

    return {
        op: 'reparentNode',
        node: command.node,
        parent: previousParent ? nodeLocator(previousParent) : undefined,
        index: previousIndex,
    };
}

function applyReorderNode(scene: SceneSpec, command: Extract<SceneCommand, { op: 'reorderNode' }>): SceneCommand {
    const located = findNode(scene, command.node)!;
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

function applyBatch(scene: SceneSpec, command: Extract<SceneCommand, { op: 'batch' }>, context: CommandValidationContext): CommandResult {
    const inverseCommands: SceneCommand[] = [];

    for (const child of command.commands) {
        const result = applyCommand(scene, child, context);
        if (!result.ok) {
            for (let i = inverseCommands.length - 1; i >= 0; i--) {
                applyCommand(scene, inverseCommands[i], context);
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

export function applyCommand(scene: SceneSpec, command: SceneCommand, context: CommandValidationContext = {}): CommandResult {
    const validation = validateCommand(scene, command, context);
    if (!validation.ok) {
        return {
            ok: false,
            command,
            error: validation.error ?? 'Command validation failed.',
        };
    }

    let inverse: SceneCommand;
    switch (command.op) {
        case 'setNodeProp':
            inverse = applySetNodeProp(scene, command);
            break;
        case 'setTransform':
            inverse = applySetTransform(scene, command);
            break;
        case 'setNodeData':
            inverse = applySetNodeData(scene, command);
            break;
        case 'setComponentProp':
            inverse = applySetComponentProp(scene, command);
            break;
        case 'addComponent':
            inverse = applyAddComponent(scene, command);
            break;
        case 'removeComponent':
            inverse = applyRemoveComponent(scene, command);
            break;
        case 'createNode':
            inverse = applyCreateNode(scene, command);
            break;
        case 'deleteNode':
            inverse = applyDeleteNode(scene, command);
            break;
        case 'reparentNode':
            inverse = applyReparentNode(scene, command);
            break;
        case 'reorderNode':
            inverse = applyReorderNode(scene, command);
            break;
        case 'batch':
            return applyBatch(scene, command, context);
    }

    return {
        ok: true,
        command,
        inverse,
    };
}

export const applySceneCommand = applyCommand;
