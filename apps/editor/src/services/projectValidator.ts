import { ComponentRegistry } from '../../../../src';
import type {
    ComponentSpec,
    EditorProjectState,
    NodeSpec,
    PrefabSpec,
} from '../../../../src';
import { validateLogicGraph } from '../../../../src';
import { z } from 'zod';
import type { ZodIssue } from 'zod';

export interface ProjectSummary {
    nodeCount: number;
    componentCount: number;
    actionCount: number;
    logicFlowCount: number;
    memoryCount: number;
    lockCount: number;
    proposalHistoryCount: number;
}

export interface ProjectValidationResult {
    ok: boolean;
    errors: string[];
    warnings: string[];
    state?: EditorProjectState;
    summary?: ProjectSummary;
}

const primitiveRecordSchema = z.record(z.string(), z.unknown());

const rectTransformSchema = z.object({
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    anchorX: z.number().optional(),
    anchorY: z.number().optional(),
    scaleX: z.number().optional(),
    scaleY: z.number().optional(),
    rotation: z.number().optional(),
}).passthrough();

const componentSchema: z.ZodType<ComponentSpec> = z.object({
    id: z.string().optional(),
    type: z.string().min(1, '组件类型不能为空'),
    props: primitiveRecordSchema.optional(),
}).passthrough();

const nodeSchema: z.ZodType<NodeSpec> = z.lazy(() => z.object({
    id: z.string().optional(),
    key: z.string().optional(),
    role: z.string().optional(),
    name: z.string().optional(),
    type: z.literal('Group'),
    transform: rectTransformSchema.optional(),
    components: z.array(componentSchema).optional(),
    children: z.array(nodeSchema).optional(),
}).passthrough());

const prefabSchema: z.ZodType<PrefabSpec> = z.object({
    version: z.number(),
    type: z.literal('prefab'),
    name: z.string().min(1, '项目名称不能为空'),
    root: nodeSchema,
}).passthrough();

const selectionSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('none') }).passthrough(),
    z.object({ type: z.literal('node'), node: z.string().min(1) }).passthrough(),
    z.object({ type: z.literal('component'), node: z.string().min(1), component: z.string().min(1) }).passthrough(),
]);

const designTokenSchema = z.object({
    colors: z.record(z.string(), z.number()).optional(),
    spacing: z.record(z.string(), z.number()).optional(),
    radius: z.record(z.string(), z.number()).optional(),
    typography: z.record(z.string(), z.object({
        fontFamily: z.string(),
        fontSize: z.number(),
        fontWeight: z.string().optional(),
    }).passthrough()).optional(),
}).passthrough();

const actionSchema = z.object({
    key: z.string().min(1, '动作键不能为空'),
    label: z.string().optional(),
    description: z.string().optional(),
    source: z.enum(['manual', 'ai', 'code']).optional(),
}).passthrough();

const logicValueSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('const'), value: z.unknown() }).passthrough(),
    z.object({ kind: z.literal('state'), path: z.string() }).passthrough(),
    z.object({ kind: z.literal('payload'), path: z.string() }).passthrough(),
]);

const logicConditionSchema = z.object({
    left: logicValueSchema,
    op: z.enum(['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'truthy', 'falsy']),
    right: logicValueSchema.optional(),
}).passthrough();

const logicStepSchema = z.discriminatedUnion('type', [
    z.object({ id: z.string().min(1), type: z.literal('condition'), condition: logicConditionSchema }).passthrough(),
    z.object({ id: z.string().min(1), type: z.literal('setState'), path: z.string(), value: logicValueSchema }).passthrough(),
    z.object({ id: z.string().min(1), type: z.literal('setNodeVisible'), node: z.string(), visible: z.boolean() }).passthrough(),
    z.object({ id: z.string().min(1), type: z.literal('emitAction'), action: z.string() }).passthrough(),
    z.object({ id: z.string().min(1), type: z.literal('comment'), text: z.string() }).passthrough(),
]);

const logicFlowSchema = z.object({
    id: z.string().min(1, '逻辑流 ID 不能为空'),
    action: z.string().min(1, '逻辑流动作不能为空'),
    name: z.string().optional(),
    description: z.string().optional(),
    steps: z.array(logicStepSchema),
}).passthrough();

const logicGraphSchema = z.object({
    version: z.literal(1),
    type: z.literal('pixif.logicGraph'),
    flows: z.array(logicFlowSchema),
}).passthrough();

const lockSchema = z.object({
    target: z.enum(['transform', 'component']),
    node: z.string().min(1),
    component: z.string().optional(),
    prop: z.string().min(1),
    reason: z.string().optional(),
}).passthrough();

const overrideSchema = z.object({
    source: z.enum(['manual', 'ai']),
    target: z.string().min(1),
    before: z.unknown().optional(),
    after: z.unknown().optional(),
    reason: z.string().optional(),
    timestamp: z.number(),
}).passthrough();

const memorySchema = z.object({
    id: z.string().min(1),
    context: z.string().min(1),
    pattern: z.string().min(1),
    before: z.unknown().optional(),
    after: z.unknown(),
    reason: z.string().optional(),
    confidence: z.number(),
    enabled: z.boolean().optional(),
    source: z.enum(['manual', 'imported', 'ai']).optional(),
}).passthrough();

const commandSchema: z.ZodType<unknown> = z.lazy(() => z.discriminatedUnion('op', [
    z.object({
        op: z.literal('setNodeProp'),
        node: z.string().min(1),
        prop: z.enum(['id', 'key', 'role', 'name']),
        value: z.string().optional(),
    }).passthrough(),
    z.object({
        op: z.literal('setTransform'),
        node: z.string().min(1),
        values: rectTransformSchema.partial(),
    }).passthrough(),
    z.object({
        op: z.literal('setComponentProp'),
        node: z.string().min(1),
        component: z.string().min(1),
        prop: z.string().min(1),
        value: z.unknown(),
    }).passthrough(),
    z.object({
        op: z.literal('addComponent'),
        node: z.string().min(1),
        component: componentSchema,
        index: z.number().int().nonnegative().optional(),
    }).passthrough(),
    z.object({
        op: z.literal('removeComponent'),
        node: z.string().min(1),
        component: z.string().min(1),
    }).passthrough(),
    z.object({
        op: z.literal('createNode'),
        parent: z.string().optional(),
        node: nodeSchema,
        index: z.number().int().nonnegative().optional(),
    }).passthrough(),
    z.object({
        op: z.literal('deleteNode'),
        node: z.string().min(1),
    }).passthrough(),
    z.object({
        op: z.literal('reparentNode'),
        node: z.string().min(1),
        parent: z.string().optional(),
        index: z.number().int().nonnegative().optional(),
    }).passthrough(),
    z.object({
        op: z.literal('reorderNode'),
        node: z.string().min(1),
        index: z.number().int().nonnegative(),
    }).passthrough(),
    z.object({
        op: z.literal('batch'),
        commands: z.array(commandSchema),
    }).passthrough(),
]));

const aiAnnotationSchema = z.object({
    node: z.string().optional(),
    component: z.string().optional(),
    prop: z.string().optional(),
    message: z.string(),
}).passthrough();

const aiProposalSchema = z.object({
    id: z.string().min(1),
    prompt: z.string(),
    explanation: z.string(),
    commands: z.array(commandSchema),
    annotations: z.array(aiAnnotationSchema).optional(),
    risks: z.array(z.string()).optional(),
}).passthrough();

const diffSchema = z.object({
    target: z.string(),
    before: z.unknown().optional(),
    after: z.unknown().optional(),
    command: commandSchema,
}).passthrough();

const warningSchema = z.object({
    target: z.string(),
    value: z.unknown(),
    message: z.string(),
}).passthrough();

const proposalHistorySchema = z.object({
    id: z.string().min(1),
    proposal: aiProposalSchema,
    status: z.enum(['generated', 'dryRunPassed', 'dryRunFailed', 'applied', 'rejected']),
    createdAt: z.number(),
    updatedAt: z.number(),
    error: z.string().optional(),
    diffs: z.array(diffSchema).optional(),
    warnings: z.array(warningSchema).optional(),
}).passthrough();

const editorProjectStateSchema = z.object({
    version: z.literal(1),
    type: z.literal('pixif.aiEditorProject'),
    prefab: prefabSchema,
    selection: selectionSchema.optional(),
    designTokens: designTokenSchema.optional(),
    actions: z.array(actionSchema),
    logicGraph: logicGraphSchema.optional(),
    locks: z.array(lockSchema),
    overrides: z.array(overrideSchema),
    memory: z.array(memorySchema),
    proposalHistory: z.array(proposalHistorySchema),
}).passthrough();

function issuePath(issue: ZodIssue) {
    return issue.path.length > 0 ? issue.path.join('.') : '项目';
}

function formatIssue(issue: ZodIssue) {
    const path = issuePath(issue);
    switch (issue.code) {
        case 'invalid_type':
            return `${path} 类型不正确。`;
        case 'invalid_value':
            return `${path} 的值不符合项目协议。`;
        case 'too_small':
            return `${path} 内容不能为空或数量不足。`;
        default:
            return `${path}: ${issue.message}`;
    }
}

function collectSummary(node: NodeSpec, summary: ProjectSummary) {
    summary.nodeCount += 1;
    summary.componentCount += node.components?.length ?? 0;
    for (const child of node.children ?? []) {
        collectSummary(child, summary);
    }
}

export function summarizeProjectState(state: EditorProjectState): ProjectSummary {
    const summary: ProjectSummary = {
        nodeCount: 0,
        componentCount: 0,
        actionCount: state.actions.length,
        logicFlowCount: state.logicGraph?.flows.length ?? 0,
        memoryCount: state.memory.length,
        lockCount: state.locks.length,
        proposalHistoryCount: state.proposalHistory.length,
    };
    collectSummary(state.prefab.root, summary);
    return summary;
}

function componentLocator(component: ComponentSpec) {
    return component.id ?? component.type;
}

function nodeLocators(node: NodeSpec) {
    return [node.id, node.key].filter((value): value is string => !!value);
}

function validatePrefabNode(
    node: NodeSpec,
    nodeMap: Map<string, NodeSpec>,
    actionKeys: Set<string>,
    errors: string[],
    warnings: string[],
    path: string,
) {
    const locators = nodeLocators(node);
    if (locators.length === 0) {
        warnings.push(`${path} 缺少 id 或 key，后续命令无法稳定定位该节点。`);
    }

    for (const locator of locators) {
        const existing = nodeMap.get(locator);
        if (existing && existing !== node) {
            errors.push(`节点定位符 "${locator}" 重复。`);
        }
        nodeMap.set(locator, node);
    }

    const componentIds = new Set<string>();
    for (const component of node.components ?? []) {
        const schema = ComponentRegistry.get(component.type);
        if (!schema) {
            errors.push(`${path} 包含未知组件类型 "${component.type}"。`);
            continue;
        }

        if (component.id) {
            if (componentIds.has(component.id)) {
                errors.push(`${path} 的组件 ID "${component.id}" 重复。`);
            }
            componentIds.add(component.id);
        }

        for (const prop of Object.keys(component.props ?? {})) {
            const propSchema = schema.props.find((candidate) => candidate.key === prop);
            if (!propSchema) {
                errors.push(`${path}.${componentLocator(component)} 包含未知属性 "${prop}"。`);
                continue;
            }

            const value = component.props?.[prop];
            if (propSchema.type === 'event' && value !== undefined) {
                if (typeof value !== 'string') {
                    errors.push(`${path}.${componentLocator(component)}.${prop} 必须引用动作键。`);
                } else if (!actionKeys.has(value)) {
                    errors.push(`${path}.${componentLocator(component)}.${prop} 引用了未声明动作 "${value}"。`);
                }
            }
        }
    }

    node.children?.forEach((child, index) => {
        validatePrefabNode(child, nodeMap, actionKeys, errors, warnings, `${path}.children[${index}]`);
    });
}

function findNode(nodeMap: Map<string, NodeSpec>, locator: string) {
    return nodeMap.get(locator);
}

function findComponent(node: NodeSpec | undefined, locator: string | undefined) {
    if (!node || !locator) {
        return undefined;
    }
    return (node.components ?? []).find((component) => component.id === locator || component.type === locator);
}

function validateSemanticState(state: EditorProjectState, errors: string[], warnings: string[]) {
    const nodeMap = new Map<string, NodeSpec>();
    const actionKeys = new Set<string>();
    for (const action of state.actions) {
        if (actionKeys.has(action.key)) {
            errors.push(`动作 "${action.key}" 重复。`);
        }
        actionKeys.add(action.key);
    }
    validatePrefabNode(state.prefab.root, nodeMap, actionKeys, errors, warnings, 'prefab.root');

    if (state.selection?.type === 'node' && !findNode(nodeMap, state.selection.node)) {
        errors.push(`当前选中的节点 "${state.selection.node}" 不存在。`);
    }

    if (state.selection?.type === 'component') {
        const node = findNode(nodeMap, state.selection.node);
        if (!findComponent(node, state.selection.component)) {
            errors.push(`当前选中的组件 "${state.selection.node}.${state.selection.component}" 不存在。`);
        }
    }

    for (const lock of state.locks) {
        const node = findNode(nodeMap, lock.node);
        if (!node) {
            errors.push(`锁定字段引用了不存在的节点 "${lock.node}"。`);
            continue;
        }
        if (lock.target === 'component' && !findComponent(node, lock.component)) {
            errors.push(`锁定字段引用了不存在的组件 "${lock.node}.${lock.component ?? ''}"。`);
        }
    }

    if (state.logicGraph) {
        const logicResult = validateLogicGraph(state.logicGraph, {
            actions: state.actions,
            prefab: state.prefab,
        });
        if (!logicResult.ok) {
            errors.push(...logicResult.errors.map((error) => `逻辑图无效：${error}`));
        }
    }
}

export function validateProjectState(value: unknown): ProjectValidationResult {
    const parsed = editorProjectStateSchema.safeParse(value);
    if (!parsed.success) {
        return {
            ok: false,
            errors: parsed.error.issues.slice(0, 8).map(formatIssue),
            warnings: [],
        };
    }

    const state = parsed.data as EditorProjectState;
    const errors: string[] = [];
    const warnings: string[] = [];
    validateSemanticState(state, errors, warnings);

    return {
        ok: errors.length === 0,
        errors,
        warnings,
        state,
        summary: summarizeProjectState(state),
    };
}

export function parseProjectJson(text: string): ProjectValidationResult {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        return {
            ok: false,
            errors: [`JSON 解析失败：${error instanceof Error ? error.message : String(error)}`],
            warnings: [],
        };
    }
    return validateProjectState(parsed);
}
