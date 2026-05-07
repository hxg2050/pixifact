import type { PrefabSpec } from "../prefab";
import { findNode } from "../commands/utils";
import { actionExists } from "./ActionRegistry";
import type { ActionSpec } from "./ActionRegistry";

export type LogicValue =
    | { kind: 'const'; value: unknown }
    | { kind: 'state'; path: string }
    | { kind: 'payload'; path: string };

export type LogicConditionOperator = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'truthy' | 'falsy';

export interface LogicConditionSpec {
    left: LogicValue;
    op: LogicConditionOperator;
    right?: LogicValue;
}

export type LogicStepSpec =
    | { id: string; type: 'condition'; condition: LogicConditionSpec }
    | { id: string; type: 'setState'; path: string; value: LogicValue }
    | { id: string; type: 'setNodeVisible'; node: string; visible: boolean }
    | { id: string; type: 'emitAction'; action: string }
    | { id: string; type: 'comment'; text: string };

export interface LogicFlowSpec {
    id: string;
    action: string;
    name?: string;
    description?: string;
    steps: LogicStepSpec[];
}

export interface LogicGraphSpec {
    version: 1;
    type: 'pixifact.logicGraph';
    flows: LogicFlowSpec[];
}

export interface LogicValidationContext {
    actions?: readonly ActionSpec[];
    prefab?: PrefabSpec;
}

export interface LogicValidationResult {
    ok: boolean;
    errors: string[];
}

export function createLogicGraph(flows: LogicFlowSpec[] = []): LogicGraphSpec {
    return {
        version: 1,
        type: 'pixifact.logicGraph',
        flows,
    };
}

export function createUseInventoryItemFlow(): LogicFlowSpec {
    return {
        id: 'flow-useInventoryItem',
        action: 'useInventoryItem',
        name: 'Use Inventory Item',
        description: 'Decrease item quantity and remove empty inventory slots.',
        steps: [
            {
                id: 'hasQuantity',
                type: 'condition',
                condition: {
                    left: { kind: 'state', path: 'selectedItem.quantity' },
                    op: 'gt',
                    right: { kind: 'const', value: 0 },
                },
            },
            {
                id: 'decreaseQuantity',
                type: 'setState',
                path: 'selectedItem.quantity',
                value: { kind: 'state', path: 'selectedItem.quantity - 1' },
            },
            {
                id: 'removeEmptySlot',
                type: 'comment',
                text: 'When quantity reaches zero, remove or hide the inventory slot in game code.',
            },
        ],
    };
}

function validateValue(value: LogicValue, errors: string[], target: string) {
    if (value.kind !== 'const' && !value.path) {
        errors.push(`${target} requires a path.`);
    }
}

function validateStep(step: LogicStepSpec, flow: LogicFlowSpec, context: LogicValidationContext, errors: string[]) {
    if (!step.id) {
        errors.push(`Logic flow "${flow.id}" contains a step without id.`);
    }

    switch (step.type) {
        case 'condition':
            validateValue(step.condition.left, errors, `${step.id}.condition.left`);
            if (step.condition.op !== 'truthy' && step.condition.op !== 'falsy' && !step.condition.right) {
                errors.push(`${step.id}.condition.right is required for ${step.condition.op}.`);
            }
            if (step.condition.right) {
                validateValue(step.condition.right, errors, `${step.id}.condition.right`);
            }
            break;
        case 'setState':
            if (!step.path) {
                errors.push(`${step.id}.path is required.`);
            }
            validateValue(step.value, errors, `${step.id}.value`);
            break;
        case 'setNodeVisible':
            if (context.prefab && !findNode(context.prefab, step.node)) {
                errors.push(`${step.id} references missing node "${step.node}".`);
            }
            break;
        case 'emitAction':
            if (context.actions && !actionExists(context.actions, step.action)) {
                errors.push(`${step.id} emits undeclared action "${step.action}".`);
            }
            break;
        case 'comment':
            if (!step.text) {
                errors.push(`${step.id}.text is required.`);
            }
            break;
    }
}

export function validateLogicGraph(graph: LogicGraphSpec, context: LogicValidationContext = {}): LogicValidationResult {
    const errors: string[] = [];

    if (graph.type !== 'pixifact.logicGraph') {
        errors.push('Logic graph type must be "pixifact.logicGraph".');
    }

    const flowIds = new Set<string>();
    for (const flow of graph.flows) {
        if (!flow.id) {
            errors.push('Logic flow id is required.');
        }
        if (flowIds.has(flow.id)) {
            errors.push(`Duplicate logic flow id "${flow.id}".`);
        }
        flowIds.add(flow.id);

        if (context.actions && !actionExists(context.actions, flow.action)) {
            errors.push(`Logic flow "${flow.id}" references undeclared action "${flow.action}".`);
        }

        for (const step of flow.steps) {
            validateStep(step, flow, context, errors);
        }
    }

    return {
        ok: errors.length === 0,
        errors,
    };
}

function accessPath(root: string, path: string): string {
    if (path.includes(' - ') || path.includes(' + ')) {
        const [left, operator, right] = path.split(/\s+/);
        const numeric = Number(right);
        if ((operator === '-' || operator === '+') && Number.isFinite(numeric)) {
            return `(${accessPath(root, left)} ${operator} ${JSON.stringify(numeric)})`;
        }
    }
    return `${root}${path.split('.').map((part) => `[${JSON.stringify(part)}]`).join('')}`;
}

function compileValue(value: LogicValue) {
    switch (value.kind) {
        case 'const':
            return JSON.stringify(value.value);
        case 'state':
            return accessPath('context.state', value.path);
        case 'payload':
            return accessPath('payload', value.path);
    }
}

function compileCondition(condition: LogicConditionSpec) {
    const left = compileValue(condition.left);
    const right = condition.right ? compileValue(condition.right) : undefined;

    switch (condition.op) {
        case 'truthy':
            return `Boolean(${left})`;
        case 'falsy':
            return `!Boolean(${left})`;
        case 'eq':
            return `${left} === ${right}`;
        case 'neq':
            return `${left} !== ${right}`;
        case 'lt':
            return `${left} < ${right}`;
        case 'lte':
            return `${left} <= ${right}`;
        case 'gt':
            return `${left} > ${right}`;
        case 'gte':
            return `${left} >= ${right}`;
    }
}

function compileStep(step: LogicStepSpec) {
    switch (step.type) {
        case 'condition':
            return `        if (!(${compileCondition(step.condition)})) return;`;
        case 'setState':
            return `        ${accessPath('context.state', step.path)} = ${compileValue(step.value)};`;
        case 'setNodeVisible':
            return `        context.setNodeVisible?.(${JSON.stringify(step.node)}, ${JSON.stringify(step.visible)});`;
        case 'emitAction':
            return `        context.emit?.(${JSON.stringify(step.action)});`;
        case 'comment':
            return `        // ${step.text.replaceAll('\n', ' ')}`;
    }
}

export function compileLogicGraphToTypescript(graph: LogicGraphSpec) {
    const handlers = graph.flows.map((flow) => {
        const steps = flow.steps.map(compileStep).join('\n');
        return `    ${JSON.stringify(flow.action)}(context: LogicRuntimeContext, payload: Record<string, unknown> = {}) {\n${steps}\n    },`;
    }).join('\n');

    return `export interface LogicRuntimeContext {
    state: Record<string, unknown>;
    emit?: (action: string, payload?: unknown) => void;
    setNodeVisible?: (node: string, visible: boolean) => void;
}

export const logicHandlers = {
${handlers}
};
`;
}

export function summarizeLogicGraphForAi(graph: LogicGraphSpec | undefined) {
    return (graph?.flows ?? [])
        .map((flow) => `- ${flow.action}: ${flow.steps.map((step) => step.type).join(' -> ')}`)
        .join('\n');
}
