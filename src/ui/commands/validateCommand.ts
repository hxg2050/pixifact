import { ComponentRegistry } from "../../core";
import type { ComponentSchema, PropSchema } from "../../core";
import type { ComponentSpec, PrefabSpec } from "../prefab";
import type { EditorCommand } from "./Command";
import { findComponent, findNode, hasDuplicateComponentId, hasDuplicateNodeId, isDescendant } from "./utils";
import type { ActionSpec } from "../editor/ActionRegistry";
import { actionExists } from "../editor/ActionRegistry";

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

function validateSetComponentProp(prefab: PrefabSpec, command: Extract<EditorCommand, { op: 'setComponentProp' }>, context: CommandValidationContext = {}) {
    const locatedNode = findNode(prefab, command.node);
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

function validateAddComponent(prefab: PrefabSpec, command: Extract<EditorCommand, { op: 'addComponent' }>, context: CommandValidationContext = {}) {
    const locatedNode = findNode(prefab, command.node);
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

function validateSetNodeProp(prefab: PrefabSpec, command: Extract<EditorCommand, { op: 'setNodeProp' }>) {
    const locatedNode = findNode(prefab, command.node);
    if (!locatedNode) {
        return fail(`Node "${command.node}" was not found.`);
    }

    if (command.value !== undefined && typeof command.value !== 'string') {
        return fail(`Node prop "${command.prop}" expects a string.`);
    }

    if (command.prop === 'id' && command.value) {
        const duplicate = findNode(prefab, command.value);
        if (duplicate && duplicate.node !== locatedNode.node) {
            return fail(`Node id "${command.value}" already exists.`);
        }
    }

    return ok();
}

function validateReparentNode(prefab: PrefabSpec, command: Extract<EditorCommand, { op: 'reparentNode' }>) {
    const locatedNode = findNode(prefab, command.node);
    if (!locatedNode) {
        return fail(`Node "${command.node}" was not found.`);
    }
    if (locatedNode.node === prefab.root) {
        return fail('Root node cannot be reparented.');
    }

    const parent = command.parent ? findNode(prefab, command.parent) : undefined;
    if (command.parent && !parent) {
        return fail(`Parent node "${command.parent}" was not found.`);
    }
    if (parent && (parent.node === locatedNode.node || isDescendant(parent.node, locatedNode.node))) {
        return fail(`Node "${command.node}" cannot be reparented under itself or its descendant.`);
    }

    return ok();
}

function validateReorderNode(prefab: PrefabSpec, command: Extract<EditorCommand, { op: 'reorderNode' }>) {
    const locatedNode = findNode(prefab, command.node);
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

export function validateCommand(prefab: PrefabSpec, command: EditorCommand, context: CommandValidationContext = {}): ValidationResult {
    switch (command.op) {
        case 'setNodeProp':
            return validateSetNodeProp(prefab, command);
        case 'setTransform':
            return findNode(prefab, command.node) ? ok() : fail(`Node "${command.node}" was not found.`);
        case 'setComponentProp':
            return validateSetComponentProp(prefab, command, context);
        case 'addComponent':
            return validateAddComponent(prefab, command, context);
        case 'removeComponent': {
            const locatedNode = findNode(prefab, command.node);
            if (!locatedNode) {
                return fail(`Node "${command.node}" was not found.`);
            }
            return findComponent(locatedNode.node, command.component)
                ? ok()
                : fail(`Component "${command.component}" was not found on node "${command.node}".`);
        }
        case 'createNode':
            if (command.parent && !findNode(prefab, command.parent)) {
                return fail(`Parent node "${command.parent}" was not found.`);
            }
            if (command.node.id && hasDuplicateNodeId(prefab, command.node.id)) {
                return fail(`Node id "${command.node.id}" already exists.`);
            }
            return ok();
        case 'deleteNode':
            if (prefab.root.id === command.node || prefab.root.key === command.node || prefab.root.name === command.node) {
                return fail('Root node cannot be deleted.');
            }
            return findNode(prefab, command.node) ? ok() : fail(`Node "${command.node}" was not found.`);
        case 'reparentNode':
            return validateReparentNode(prefab, command);
        case 'reorderNode':
            return validateReorderNode(prefab, command);
        case 'batch':
            return Array.isArray(command.commands) ? ok() : fail('Batch command expects a commands array.');
        default:
            return fail('Unknown command.');
    }
}
