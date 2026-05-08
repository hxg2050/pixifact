import { ComponentRegistry } from "../runtime";
import type { ComponentSchema, PropSchema } from "../runtime";
import type { ComponentSpec, NodeSpec, SceneSpec } from "../scene";
import type { SceneCommand } from "./Command";
import { findComponent, findNode, hasDuplicateComponentId, hasDuplicateNodeId, isDescendant } from "./utils";
import type { ActionSpec } from "../authoring/ActionRegistry";
import { actionExists } from "../authoring/ActionRegistry";

export interface ValidationResult {
    ok: boolean;
    error?: string;
}

export interface CommandValidationContext {
    actions?: readonly ActionSpec[];
}

function ok(): ValidationResult {
    return { ok: true };
}

function fail(error: string): ValidationResult {
    return { ok: false, error };
}

function canContainChildNode(node: NodeSpec, root: NodeSpec) {
    return node === root || node.kind === 'container';
}

function validateChildParent(parent: NodeSpec, root: NodeSpec) {
    return canContainChildNode(parent, root)
        ? ok()
        : fail('Only container nodes can contain child nodes.');
}

function validateNodeSpec(node: NodeSpec): ValidationResult {
    if (!['container', 'image', 'text', 'input', 'shape'].includes(node.kind)) {
        return fail('Node kind must be one of: container, image, text, input, shape.');
    }

    if (node.kind !== 'container' && Array.isArray((node as { children?: unknown }).children) && (node as { children?: unknown[] }).children!.length > 0) {
        return fail('Only container nodes can declare children.');
    }

    if (node.kind === 'container') {
        for (const child of node.children ?? []) {
            const result = validateNodeSpec(child);
            if (!result.ok) {
                return result;
            }
        }
    }

    return ok();
}

function validateValue(prop: PropSchema, value: unknown, context: CommandValidationContext = {}): ValidationResult {
    if (value === undefined) {
        return ok();
    }

    switch (prop.type) {
        case 'number':
        case 'color':
            return typeof value === 'number' ? ok() : fail(`Prop "${prop.key}" expects a number.`);
        case 'string':
            return typeof value === 'string' ? ok() : fail(`Prop "${prop.key}" expects a string.`);
        case 'event':
            if (typeof value !== 'string') {
                return fail(`Prop "${prop.key}" expects an action key string.`);
            }
            if (context.actions && !actionExists(context.actions, value)) {
                return fail(`Action "${value}" is not declared in the project action registry.`);
            }
            return ok();
        case 'assetRef':
        case 'nodeRef':
        case 'componentRef':
            return typeof value === 'string' || (typeof value === 'object' && value !== null)
                ? ok()
                : fail(`Prop "${prop.key}" expects a reference or string value.`);
        case 'boolean':
            return typeof value === 'boolean' ? ok() : fail(`Prop "${prop.key}" expects a boolean.`);
        case 'enum':
            return prop.options?.includes(value as string | number)
                ? ok()
                : fail(`Prop "${prop.key}" expects one of: ${(prop.options ?? []).join(', ')}.`);
        case 'vec2':
        case 'rect':
            return typeof value === 'object' && value !== null ? ok() : fail(`Prop "${prop.key}" expects an object.`);
        default:
            return ok();
    }
}

function displayProp(type: PropSchema['type'], key: string, options?: readonly (string | number)[]): PropSchema {
    return {
        key,
        type,
        options,
    };
}

const nodeDataProps: Record<Exclude<NodeSpec['kind'], 'container'>, readonly PropSchema[]> = {
    image: [
        displayProp('enum', 'mode', ['sprite', 'nineSlice']),
        displayProp('assetRef', 'src'),
        displayProp('color', 'tint'),
        displayProp('number', 'leftWidth'),
        displayProp('number', 'rightWidth'),
        displayProp('number', 'topHeight'),
        displayProp('number', 'bottomHeight'),
    ],
    text: [
        displayProp('string', 'value'),
        displayProp('color', 'color'),
        displayProp('number', 'fontSize'),
        displayProp('string', 'fontFamily'),
        displayProp('enum', 'fontWeight', ['normal', 'bold', 'bolder', 'lighter', '100', '200', '300', '400', '500', '600', '700', '800', '900']),
        displayProp('boolean', 'center'),
    ],
    input: [
        displayProp('string', 'value'),
        displayProp('color', 'backgroundColor'),
        displayProp('color', 'borderColor'),
        displayProp('number', 'borderSize'),
        displayProp('string', 'textColor'),
        displayProp('number', 'fontSize'),
        displayProp('string', 'fontFamily'),
        displayProp('number', 'paddingLeft'),
        displayProp('number', 'paddingRight'),
        displayProp('number', 'paddingTop'),
        displayProp('number', 'paddingBottom'),
    ],
    shape: [
        displayProp('enum', 'type', ['rect', 'roundedRect']),
        displayProp('color', 'color'),
        displayProp('number', 'fillAlpha'),
        displayProp('number', 'radius'),
        displayProp('color', 'strokeColor'),
        displayProp('number', 'strokeWidth'),
        displayProp('number', 'strokeAlpha'),
    ],
};

function validateSetNodeData(scene: SceneSpec, command: Extract<SceneCommand, { op: 'setNodeData' }>) {
    const locatedNode = findNode(scene, command.node);
    if (!locatedNode) {
        return fail(`Node "${command.node}" was not found.`);
    }
    if (locatedNode.node.kind !== command.field) {
        return fail(`Node "${command.node}" is ${locatedNode.node.kind}, not ${command.field}.`);
    }

    const prop = nodeDataProps[command.field].find((candidate) => candidate.key === command.prop);
    if (!prop) {
        return fail(`Node data prop "${command.prop}" does not exist on ${command.field}.`);
    }

    return validateValue(prop, command.value);
}

function validateComponentSpec(component: ComponentSpec, context: CommandValidationContext = {}): ValidationResult {
    const schema = ComponentRegistry.get(component.type);
    if (!schema) {
        return fail(`Unknown component type "${component.type}".`);
    }

    for (const [key, value] of Object.entries(component.props ?? {})) {
        const prop = schema.props.find((candidate) => candidate.key === key);
        if (!prop) {
            return fail(`Prop "${key}" does not exist on ${component.type}.`);
        }
        const result = validateValue(prop, value, context);
        if (!result.ok) {
            return result;
        }
    }

    return ok();
}

function validateSetComponentProp(scene: SceneSpec, command: Extract<SceneCommand, { op: 'setComponentProp' }>, context: CommandValidationContext = {}) {
    const locatedNode = findNode(scene, command.node);
    if (!locatedNode) {
        return fail(`Node "${command.node}" was not found.`);
    }

    const locatedComponent = findComponent(locatedNode.node, command.component);
    if (!locatedComponent) {
        return fail(`Component "${command.component}" was not found on node "${command.node}".`);
    }

    const schema = ComponentRegistry.get(locatedComponent.component.type);
    if (!schema) {
        return fail(`Unknown component type "${locatedComponent.component.type}".`);
    }

    const prop = schema.props.find((candidate) => candidate.key === command.prop);
    if (!prop) {
        return fail(`Prop "${command.prop}" does not exist on ${schema.type}.`);
    }

    return validateValue(prop, command.value, context);
}

function validateAddComponent(scene: SceneSpec, command: Extract<SceneCommand, { op: 'addComponent' }>, context: CommandValidationContext = {}) {
    const locatedNode = findNode(scene, command.node);
    if (!locatedNode) {
        return fail(`Node "${command.node}" was not found.`);
    }

    const result = validateComponentSpec(command.component, context);
    if (!result.ok) {
        return result;
    }

    const schema = ComponentRegistry.get(command.component.type) as ComponentSchema | undefined;
    if (schema?.disallowMultiple && (locatedNode.node.components ?? []).some((component) => component.type === command.component.type)) {
        return fail(`Component "${command.component.type}" cannot be added more than once.`);
    }

    if (command.component.id && hasDuplicateComponentId(locatedNode.node, command.component.id)) {
        return fail(`Component id "${command.component.id}" already exists on node "${command.node}".`);
    }

    return ok();
}

function validateSetNodeProp(scene: SceneSpec, command: Extract<SceneCommand, { op: 'setNodeProp' }>) {
    const locatedNode = findNode(scene, command.node);
    if (!locatedNode) {
        return fail(`Node "${command.node}" was not found.`);
    }

    if (command.value !== undefined && typeof command.value !== 'string') {
        return fail(`Node prop "${command.prop}" expects a string.`);
    }

    if (command.prop === 'id' && command.value) {
        const duplicate = findNode(scene, command.value);
        if (duplicate && duplicate.node !== locatedNode.node) {
            return fail(`Node id "${command.value}" already exists.`);
        }
    }

    return ok();
}

function validateReparentNode(scene: SceneSpec, command: Extract<SceneCommand, { op: 'reparentNode' }>) {
    const locatedNode = findNode(scene, command.node);
    if (!locatedNode) {
        return fail(`Node "${command.node}" was not found.`);
    }
    if (locatedNode.node === scene.root) {
        return fail('Root node cannot be reparented.');
    }

    const parent = command.parent ? findNode(scene, command.parent) : undefined;
    if (command.parent && !parent) {
        return fail(`Parent node "${command.parent}" was not found.`);
    }
    if (parent && (parent.node === locatedNode.node || isDescendant(parent.node, locatedNode.node))) {
        return fail(`Node "${command.node}" cannot be reparented under itself or its descendant.`);
    }

    return validateChildParent(parent?.node ?? scene.root, scene.root);
}

function validateReorderNode(scene: SceneSpec, command: Extract<SceneCommand, { op: 'reorderNode' }>) {
    const locatedNode = findNode(scene, command.node);
    if (!locatedNode) {
        return fail(`Node "${command.node}" was not found.`);
    }
    if (!locatedNode.parent) {
        return fail('Root node cannot be reordered.');
    }
    if (!Number.isInteger(command.index) || command.index < 0) {
        return fail('Reorder index must be a non-negative integer.');
    }
    return ok();
}

export function validateCommand(scene: SceneSpec, command: SceneCommand, context: CommandValidationContext = {}): ValidationResult {
    switch (command.op) {
        case 'setNodeProp':
            return validateSetNodeProp(scene, command);
        case 'setTransform':
            return findNode(scene, command.node) ? ok() : fail(`Node "${command.node}" was not found.`);
        case 'setNodeData':
            return validateSetNodeData(scene, command);
        case 'setComponentProp':
            return validateSetComponentProp(scene, command, context);
        case 'addComponent':
            return validateAddComponent(scene, command, context);
        case 'removeComponent': {
            const locatedNode = findNode(scene, command.node);
            if (!locatedNode) {
                return fail(`Node "${command.node}" was not found.`);
            }
            return findComponent(locatedNode.node, command.component)
                ? ok()
                : fail(`Component "${command.component}" was not found on node "${command.node}".`);
        }
        case 'createNode':
            const parent = command.parent ? findNode(scene, command.parent) : undefined;
            if (command.parent && !parent) {
                return fail(`Parent node "${command.parent}" was not found.`);
            }
            {
                const result = validateNodeSpec(command.node);
                if (!result.ok) {
                    return result;
                }
            }
            if (command.node.id && hasDuplicateNodeId(scene, command.node.id)) {
                return fail(`Node id "${command.node.id}" already exists.`);
            }
            return validateChildParent(parent?.node ?? scene.root, scene.root);
        case 'deleteNode':
            if (scene.root.id === command.node || scene.root.key === command.node || scene.root.name === command.node) {
                return fail('Root node cannot be deleted.');
            }
            return findNode(scene, command.node) ? ok() : fail(`Node "${command.node}" was not found.`);
        case 'reparentNode':
            return validateReparentNode(scene, command);
        case 'reorderNode':
            return validateReorderNode(scene, command);
        case 'batch':
            return Array.isArray(command.commands) ? ok() : fail('Batch command expects a commands array.');
        default:
            return fail('Unknown command.');
    }
}

export const validateSceneCommand = validateCommand;
