import type { EditorCommand } from "../commands";
import type { PrefabSpec } from "../prefab";
import type { DesignTokenSpec } from "./DesignToken";
import type { EditorSelection } from "./EditorSelection";
import { getAiComponentSchemas, summarizePrefabForAi } from "./ai";
import type { AiPrefabSummary } from "./ai";
import { lockKey } from "./OverrideJournal";
import type { LockSpec } from "./OverrideJournal";
import { enabledMemory, summarizeMemoryForAi } from "./PreferenceMemory";
import type { PreferenceMemory } from "./PreferenceMemory";
import { summarizeActionsForAi } from "./ActionRegistry";
import type { ActionSpec } from "./ActionRegistry";
import { summarizeLogicGraphForAi } from "./LogicGraph";
import type { LogicGraphSpec } from "./LogicGraph";

export interface AiProposalContext {
    prefab: PrefabSpec;
    selection?: string;
    designTokens?: DesignTokenSpec;
    actions?: readonly ActionSpec[];
    logicGraph?: LogicGraphSpec;
    locks?: readonly LockSpec[];
    memory?: readonly PreferenceMemory[];
}

export type AiModelApi = 'chatCompletions' | 'responses';

export interface AiModelConfig {
    api?: AiModelApi;
    endpoint?: string;
    token?: string;
    envKey?: string;
    model?: string;
    timeoutMs?: number;
    authHeader?: string;
    authPrefix?: string;
    temperature?: number;
    reasoningEffort?: string;
    serviceTier?: string;
    store?: boolean;
}

export interface AiAuthoringContext {
    prefab: PrefabSpec;
    prefabSummary: AiPrefabSummary;
    componentSchemas: ReturnType<typeof getAiComponentSchemas>;
    commandSchemas: ReturnType<typeof getAiCommandSchemas>;
    commandSummary: string;
    selection?: EditorSelection;
    designTokens?: DesignTokenSpec;
    actions: ActionSpec[];
    actionSummary: string;
    logicGraph?: LogicGraphSpec;
    logicSummary: string;
    locks: LockSpec[];
    lockedTargets: string[];
    memory: PreferenceMemory[];
    memorySummary: string;
}

export function getAiCommandSchemas() {
    return [{
        op: 'batch',
        description: 'Run multiple EditorCommand objects in order.',
        shape: { op: 'batch', commands: 'EditorCommand[]' },
    }, {
        op: 'createNode',
        description: 'Create a Group node under parent. Omit parent to create under root.',
        shape: {
            op: 'createNode',
            parent: 'optional node id/key/name',
            node: {
                type: 'Group',
                id: 'unique id',
                key: 'unique key',
                role: 'optional semantic role',
                name: 'display name',
                transform: { x: 'number', y: 'number', width: 'number', height: 'number' },
                components: 'ComponentSpec[]',
                children: 'NodeSpec[]',
            },
            index: 'optional number',
        },
    }, {
        op: 'setComponentProp',
        description: 'Set a prop on an existing component by component id or type.',
        shape: { op: 'setComponentProp', node: 'node id/key/name', component: 'component id/type', prop: 'prop key', value: 'schema-valid value' },
    }, {
        op: 'setTransform',
        description: 'Set x/y/width/height/anchor/scale/rotation on an existing node.',
        shape: { op: 'setTransform', node: 'node id/key/name', values: { x: 'number', y: 'number', width: 'number', height: 'number' } },
    }, {
        op: 'setNodeProp',
        description: 'Set id, key, role, or name on an existing node.',
        shape: { op: 'setNodeProp', node: 'node id/key/name', prop: 'id | key | role | name', value: 'string or undefined' },
    }, {
        op: 'addComponent',
        description: 'Add a ComponentSpec to an existing node.',
        shape: { op: 'addComponent', node: 'node id/key/name', component: { id: 'optional id', type: 'registered component type', props: 'schema-valid props' }, index: 'optional number' },
    }, {
        op: 'removeComponent',
        description: 'Remove component from an existing node.',
        shape: { op: 'removeComponent', node: 'node id/key/name', component: 'component id/type' },
    }, {
        op: 'deleteNode',
        description: 'Delete an existing non-root node.',
        shape: { op: 'deleteNode', node: 'node id/key/name' },
    }, {
        op: 'reparentNode',
        description: 'Move an existing non-root node under a different parent.',
        shape: { op: 'reparentNode', node: 'node id/key/name', parent: 'optional node id/key/name', index: 'optional number' },
    }, {
        op: 'reorderNode',
        description: 'Reorder an existing non-root node among siblings.',
        shape: { op: 'reorderNode', node: 'node id/key/name', index: 'number' },
    }];
}

export function getAiCommandSummary() {
    return [
        'Use only these EditorCommand ops: batch, createNode, setComponentProp, setTransform, setNodeProp, addComponent, removeComponent, deleteNode, reparentNode, reorderNode.',
        'All created nodes must be NodeSpec objects with type: "Group".',
        'Components must use registered component types from componentSchemas, for example ui.RoundedRectGraphic, ui.TextGraphic, ui.Button.',
        'Button onClick is an event prop and must reference a declared action key such as useInventoryItem.',
        'To create complex UI, prefer one batch command containing createNode commands or nested children inside one createNode.',
        'Example inventory panel command: {"op":"createNode","parent":"submitButton","node":{"type":"Group","id":"inventoryPanel","key":"inventoryPanel","role":"inventory-panel","name":"背包面板","transform":{"x":80,"y":48,"width":512,"height":480},"components":[{"id":"panelBg","type":"ui.RoundedRectGraphic","props":{"color":16316668,"radius":12}}],"children":[{"type":"Group","id":"inventoryTitle","key":"inventoryTitle","role":"panel-title","name":"标题","transform":{"x":24,"y":18,"width":360,"height":30},"components":[{"id":"text","type":"ui.TextGraphic","props":{"text":"背包","fontSize":22,"color":1515571}}]}]}}',
    ].join('\n');
}

export interface AiProposalRequest {
    protocol: 'pixif.aiProposal.v1';
    prompt: string;
    context: AiAuthoringContext;
    model?: AiModelConfig;
}

export interface AiProposalRequestOptions {
    model?: AiModelConfig;
}

function clone<T>(value: T): T {
    return structuredClone(value);
}

export function buildAiAuthoringContext(context: AiProposalContext): AiAuthoringContext {
    const locks = clone([...(context.locks ?? [])]);
    const memory = clone(enabledMemory(context.memory ?? []));
    const actions = clone([...(context.actions ?? [])]);
    const selection = context.selection ? { type: 'node', node: context.selection } as const : undefined;

    return {
        prefab: clone(context.prefab),
        prefabSummary: summarizePrefabForAi(context.prefab),
        componentSchemas: getAiComponentSchemas(),
        commandSchemas: getAiCommandSchemas(),
        commandSummary: getAiCommandSummary(),
        selection,
        designTokens: context.designTokens ? clone(context.designTokens) : undefined,
        actions,
        actionSummary: summarizeActionsForAi(actions),
        logicGraph: context.logicGraph ? clone(context.logicGraph) : undefined,
        logicSummary: summarizeLogicGraphForAi(context.logicGraph),
        locks,
        lockedTargets: locks.map(lockKey),
        memory,
        memorySummary: summarizeMemoryForAi(memory),
    };
}

export function createAiProposalRequest(
    prompt: string,
    context: AiProposalContext,
    options: AiProposalRequestOptions = {},
): AiProposalRequest {
    const request: AiProposalRequest = {
        protocol: 'pixif.aiProposal.v1',
        prompt,
        context: buildAiAuthoringContext(context),
    };
    if (options.model) {
        request.model = clone(options.model);
    }
    return request;
}

export interface AiCommandEnvelope {
    commands: EditorCommand[];
}
