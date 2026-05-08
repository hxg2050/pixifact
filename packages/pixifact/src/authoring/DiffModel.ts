import type { SceneCommand } from "../commands";
import type { SceneSpec } from "../scene";
import { findComponent, findNode } from "../commands/utils";

export interface DiffEntry {
    target: string;
    before: unknown;
    after: unknown;
    command: SceneCommand;
}

function formatTarget(parts: Array<string | undefined>) {
    return parts.filter(Boolean).join('.');
}

export function diffCommand(scene: SceneSpec, command: SceneCommand): DiffEntry[] {
    switch (command.op) {
        case 'setNodeProp': {
            const node = findNode(scene, command.node)?.node;
            return [{
                target: formatTarget([command.node, command.prop]),
                before: node?.[command.prop],
                after: command.value,
                command,
            }];
        }
        case 'setTransform': {
            const node = findNode(scene, command.node)?.node;
            return Object.entries(command.values).map(([key, value]) => ({
                target: formatTarget([command.node, 'transform', key]),
                before: node?.transform?.[key as keyof typeof node.transform],
                after: value,
                command,
            }));
        }
        case 'setNodeData': {
            const node = findNode(scene, command.node)?.node;
            const data = node && node.kind === command.field
                ? (node as unknown as Record<string, Record<string, unknown> | undefined>)[command.field]
                : undefined;
            return [{
                target: formatTarget([command.node, command.field, command.prop]),
                before: data?.[command.prop],
                after: command.value,
                command,
            }];
        }
        case 'setComponentProp': {
            const node = findNode(scene, command.node)?.node;
            const component = node ? findComponent(node, command.component)?.component : undefined;
            return [{
                target: formatTarget([command.node, command.component, command.prop]),
                before: component?.props?.[command.prop],
                after: command.value,
                command,
            }];
        }
        case 'addComponent':
            return [{
                target: formatTarget([command.node, command.component.id ?? command.component.type]),
                before: undefined,
                after: command.component,
                command,
            }];
        case 'removeComponent': {
            const node = findNode(scene, command.node)?.node;
            const component = node ? findComponent(node, command.component)?.component : undefined;
            return [{
                target: formatTarget([command.node, command.component]),
                before: component,
                after: undefined,
                command,
            }];
        }
        case 'createNode':
            return [{
                target: formatTarget([command.parent ?? 'root', command.node.id ?? command.node.key ?? command.node.name]),
                before: undefined,
                after: command.node,
                command,
            }];
        case 'deleteNode': {
            const node = findNode(scene, command.node)?.node;
            return [{
                target: command.node,
                before: node,
                after: undefined,
                command,
            }];
        }
        case 'reparentNode': {
            const node = findNode(scene, command.node);
            return [{
                target: formatTarget([command.node, 'parent']),
                before: node?.parent?.key ?? node?.parent?.id ?? node?.parent?.name,
                after: command.parent ?? 'root',
                command,
            }];
        }
        case 'reorderNode': {
            const node = findNode(scene, command.node);
            return [{
                target: formatTarget([command.node, 'index']),
                before: node?.index,
                after: command.index,
                command,
            }];
        }
        case 'batch':
            return diffCommands(scene, command.commands);
    }
}

export function diffCommands(scene: SceneSpec, commands: SceneCommand[]) {
    return commands.flatMap((command) => diffCommand(scene, command));
}
