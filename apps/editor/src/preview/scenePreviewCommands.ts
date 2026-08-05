import {
    isSceneTemplateBindingValue,
    pixiSceneFieldSchema,
    type CompilerSceneCommand,
} from 'pixifact/compiler';

type NodePropCommand = Extract<CompilerSceneCommand, { op: 'setNodeProp' }>;

export function incrementalScenePreviewCommands(
    command: CompilerSceneCommand,
    inverse: CompilerSceneCommand,
): NodePropCommand[] | undefined {
    const commands = nodePropCommands(command);
    const inverseCommands = nodePropCommands(inverse);
    if (!commands || !inverseCommands) return undefined;
    if ([...commands, ...inverseCommands].some((child) => (
        isSceneTemplateBindingValue(child.value)
        || pixiSceneFieldSchema(child.prop)?.resource !== undefined
    ))) {
        return undefined;
    }
    return commands;
}

function nodePropCommands(command: CompilerSceneCommand): NodePropCommand[] | undefined {
    if (command.op === 'setNodeProp') return [command];
    if (command.op !== 'batch' || !command.commands.every((child) => child.op === 'setNodeProp')) {
        return undefined;
    }
    return command.commands;
}
