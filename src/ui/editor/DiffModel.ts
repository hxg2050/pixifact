import type { EditorCommand } from "../commands";
import type { PrefabSpec } from "../prefab";
import { findComponent, findNode } from "../commands/utils";

export interface DiffEntry {
    target: string;
    before: unknown;
    after: unknown;
    command: EditorCommand;
}

function formatTarget(parts: Array<string | undefined>) {
    return parts.filter(Boolean).join('.');
}

export function diffCommand(prefab: PrefabSpec, command: EditorCommand): DiffEntry[] {
    switch (command.op) {
        case 'setNodeProp': {
            const node = findNode(prefab, command.node)?.node;
            return [{
                target: formatTarget([command.node, command.prop]),
                before: node?.[command.prop],
                after: command.value,
                command,
            }];
        }
        case 'setTransform': {
            const node = findNode(prefab, command.node)?.node;
            return Object.entries(command.values).map(([key, value]) => ({
                target: formatTarget([command.node, 'transform', key]),
                before: node?.transform?.[key as keyof typeof node.transform],
                after: value,
                command,
            }));
        }
        case 'setComponentProp': {
            const node = findNode(prefab, command.node)?.node;
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
            const node = findNode(prefab, command.node)?.node;
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
            const node = findNode(prefab, command.node)?.node;
            return [{
                target: command.node,
                before: node,
                after: undefined,
                command,
            }];
        }
        case 'reparentNode': {
            const node = findNode(prefab, command.node);
            return [{
                target: formatTarget([command.node, 'parent']),
                before: node?.parent?.key ?? node?.parent?.id ?? node?.parent?.name,
                after: command.parent ?? 'root',
                command,
            }];
        }
        case 'reorderNode': {
            const node = findNode(prefab, command.node);
            return [{
                target: formatTarget([command.node, 'index']),
                before: node?.index,
                after: command.index,
                command,
            }];
        }
        case 'batch':
            return diffCommands(prefab, command.commands);
    }
}

export function diffCommands(prefab: PrefabSpec, commands: EditorCommand[]) {
    return commands.flatMap((command) => diffCommand(prefab, command));
}
