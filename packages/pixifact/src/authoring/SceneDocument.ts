import EventEmitter from "eventemitter3";
import { CommandStack } from "../commands/CommandStack";
import type { SceneCommand } from "../commands/Command";
import type { CommandResult } from "../commands/applyCommand";
import { findNode } from "../commands/utils";
import type { InstantiateContext, SceneSpec } from "../scene";
import type { Group } from "../runtime";
import { emptySelection } from "./SceneSelection";
import type { SceneSelection } from "./SceneSelection";
import { buildInspectorModel } from "./InspectorModel";
import type { InspectorNodeModel } from "./InspectorModel";
import { createRuntimePreview, destroyRuntimePreview } from "./RuntimePreview";
import type { RuntimePreview } from "./RuntimePreview";
import { lockKey } from "./OverrideJournal";
import type { LockSpec, OverrideSpec } from "./OverrideJournal";
import { createMemorySuggestions } from "./PreferenceMemory";
import type { MemorySuggestion, PreferenceMemory } from "./PreferenceMemory";
import { isSceneProjectState } from "./SceneProjectState";
import type { SceneProjectState } from "./SceneProjectState";
import type { DesignTokenSpec } from "./DesignToken";
import { createProposalHistoryEntry } from "./ProposalHistory";
import type { ProposalHistoryEntry, ProposalHistoryStatus } from "./ProposalHistory";
import type { AiProposal } from "./AiProposal";
import type { ProposalRunResult } from "./ProposalRunner";
import { upsertAction } from "./ActionRegistry";
import type { ActionSpec } from "./ActionRegistry";
import { createLogicGraph, validateLogicGraph } from "./LogicGraph";
import type { LogicFlowSpec, LogicGraphSpec } from "./LogicGraph";

export interface SceneDocumentEventMap {
    changed: [result: CommandResult];
    loaded: [scene: SceneSpec];
    previewRebuilt: [preview: RuntimePreview];
    selectionChanged: [selection: SceneSelection];
}

function cloneScene(scene: SceneSpec): SceneSpec {
    return structuredClone(scene);
}

export class SceneDocument {
    public scene: SceneSpec;
    public selection: SceneSelection = emptySelection;
    public dirty = false;
    public emitter = new EventEmitter<SceneDocumentEventMap>();
    public preview?: RuntimePreview;
    public locks: LockSpec[] = [];
    public overrides: OverrideSpec[] = [];
    public memory: PreferenceMemory[] = [];
    public designTokens?: DesignTokenSpec;
    public actions: ActionSpec[] = [];
    public logicGraph: LogicGraphSpec = createLogicGraph();
    public proposalHistory: ProposalHistoryEntry[] = [];
    private commandStack = new CommandStack();
    private previewContext?: InstantiateContext;
    private previewParent?: Group;

    constructor(scene: SceneSpec) {
        this.scene = cloneScene(scene);
    }

    apply(command: SceneCommand, source: OverrideSpec['source'] = 'manual'): CommandResult {
        const result = this.commandStack.execute(this.scene, command, {
            actions: this.actions.length > 0 ? this.actions : undefined,
        });
        if (!result.ok) {
            return result;
        }
        this.recordOverride(result, source);
        this.dirty = true;
        this.ensureSelectionValid();
        this.rebuildPreview();
        this.emitter.emit('changed', result);
        return result;
    }

    addLock(lock: LockSpec) {
        const key = lockKey(lock);
        if (!this.locks.some((item) => lockKey(item) === key)) {
            this.locks.push(lock);
            this.dirty = true;
        }
    }

    removeLock(lock: Omit<LockSpec, 'reason'>) {
        const key = lockKey(lock);
        const previousLength = this.locks.length;
        this.locks = this.locks.filter((item) => lockKey(item) !== key);
        if (this.locks.length !== previousLength) {
            this.dirty = true;
        }
    }

    getMemorySuggestions(): MemorySuggestion[] {
        const accepted = new Set(this.memory.map((item) => item.context));
        return createMemorySuggestions(this.overrides)
            .filter((suggestion) => !accepted.has(suggestion.memory.context));
    }

    acceptMemorySuggestion(suggestion: MemorySuggestion) {
        if (!this.memory.some((item) => item.id === suggestion.memory.id || item.context === suggestion.memory.context)) {
            this.memory.push(suggestion.memory);
            this.dirty = true;
        }
    }

    upsertMemory(memory: PreferenceMemory) {
        const existing = this.memory.find((item) => item.id === memory.id);
        if (existing) {
            Object.assign(existing, memory);
        } else {
            this.memory.push(memory);
        }
        this.dirty = true;
    }

    setMemoryEnabled(id: string, enabled: boolean) {
        const item = this.memory.find((memory) => memory.id === id);
        if (item && item.enabled !== enabled) {
            item.enabled = enabled;
            this.dirty = true;
        }
    }

    removeMemory(id: string) {
        const previousLength = this.memory.length;
        this.memory = this.memory.filter((memory) => memory.id !== id);
        if (this.memory.length !== previousLength) {
            this.dirty = true;
        }
    }

    importMemory(memory: readonly PreferenceMemory[], replace = false) {
        if (replace) {
            this.memory = structuredClone([...memory]);
        } else {
            for (const item of memory) {
                this.upsertMemory({
                    ...structuredClone(item),
                    source: item.source ?? 'imported',
                });
            }
        }
        this.dirty = true;
    }

    addAction(action: ActionSpec) {
        upsertAction(this.actions, action);
        this.dirty = true;
    }

    removeAction(key: string) {
        const previousLength = this.actions.length;
        this.actions = this.actions.filter((action) => action.key !== key);
        if (this.actions.length !== previousLength) {
            this.dirty = true;
        }
    }

    addLogicFlow(flow: LogicFlowSpec) {
        const graph = structuredClone(this.logicGraph);
        const index = graph.flows.findIndex((item) => item.id === flow.id);
        if (index === -1) {
            graph.flows.push(flow);
        } else {
            graph.flows[index] = flow;
        }

        const validation = validateLogicGraph(graph, {
            actions: this.actions.length > 0 ? this.actions : undefined,
            scene: this.scene,
        });
        if (!validation.ok) {
            return {
                ok: false as const,
                errors: validation.errors,
            };
        }

        this.logicGraph = graph;
        this.dirty = true;
        return {
            ok: true as const,
            graph: this.logicGraph,
        };
    }

    removeLogicFlow(id: string) {
        const previousLength = this.logicGraph.flows.length;
        this.logicGraph = {
            ...this.logicGraph,
            flows: this.logicGraph.flows.filter((flow) => flow.id !== id),
        };
        if (this.logicGraph.flows.length !== previousLength) {
            this.dirty = true;
        }
    }

    recordProposal(proposal: AiProposal, status: ProposalHistoryStatus = 'generated') {
        const entry = this.upsertProposalHistory(proposal);
        entry.status = status;
        entry.updatedAt = Date.now();
        this.dirty = true;
        return entry;
    }

    recordProposalRun(result: ProposalRunResult) {
        const entry = this.upsertProposalHistory(result.proposal);
        entry.status = result.ok ? 'dryRunPassed' : 'dryRunFailed';
        entry.error = result.error;
        entry.diffs = structuredClone(result.diffs);
        entry.warnings = structuredClone(result.warnings);
        entry.updatedAt = Date.now();
        this.dirty = true;
        return entry;
    }

    markProposalApplied(proposal: AiProposal) {
        return this.markProposalStatus(proposal, 'applied');
    }

    markProposalRejected(proposal: AiProposal) {
        return this.markProposalStatus(proposal, 'rejected');
    }

    private markProposalStatus(proposal: AiProposal, status: ProposalHistoryStatus) {
        const entry = this.upsertProposalHistory(proposal);
        entry.status = status;
        entry.updatedAt = Date.now();
        this.dirty = true;
        return entry;
    }

    private upsertProposalHistory(proposal: AiProposal) {
        const existing = this.proposalHistory.find((entry) => entry.id === proposal.id);
        if (existing) {
            existing.proposal = structuredClone(proposal);
            return existing;
        }

        const entry = createProposalHistoryEntry(proposal);
        this.proposalHistory.push(entry);
        return entry;
    }

    private recordOverride(result: Extract<CommandResult, { ok: true }>, source: OverrideSpec['source']) {
        const command = result.command;
        const inverse = result.inverse;

        if (command.op === 'batch' && inverse.op === 'batch') {
            for (let i = 0; i < command.commands.length; i++) {
                const child = command.commands[i];
                const inverseChild = inverse.commands[inverse.commands.length - 1 - i];
                this.recordOverride({ ok: true, command: child, inverse: inverseChild }, source);
            }
            return;
        }

        if (command.op === 'setNodeProp' && inverse.op === 'setNodeProp') {
            this.overrides.push({
                source,
                target: `${command.node}.${command.prop}`,
                before: inverse.value,
                after: command.value,
                timestamp: Date.now(),
            });
        }

        if (command.op === 'setComponentProp' && inverse.op === 'setComponentProp') {
            this.overrides.push({
                source,
                target: `${command.node}.${command.component}.${command.prop}`,
                before: inverse.value,
                after: command.value,
                timestamp: Date.now(),
            });
        }

        if (command.op === 'setTransform' && inverse.op === 'setTransform') {
            for (const [prop, after] of Object.entries(command.values)) {
                this.overrides.push({
                    source,
                    target: `${command.node}.transform.${prop}`,
                    before: inverse.values[prop as keyof typeof inverse.values],
                    after,
                    timestamp: Date.now(),
                });
            }
        }

        if (command.op === 'setNodeData' && inverse.op === 'setNodeData') {
            this.overrides.push({
                source,
                target: `${command.node}.${command.field}.${command.prop}`,
                before: inverse.value,
                after: command.value,
                timestamp: Date.now(),
            });
        }
    }

    undo() {
        const result = this.commandStack.undo(this.scene, {
            actions: this.actions.length > 0 ? this.actions : undefined,
        });
        if (result?.ok) {
            this.dirty = true;
            this.ensureSelectionValid();
            this.rebuildPreview();
            this.emitter.emit('changed', result);
        }
        return result;
    }

    redo() {
        const result = this.commandStack.redo(this.scene, {
            actions: this.actions.length > 0 ? this.actions : undefined,
        });
        if (result?.ok) {
            this.dirty = true;
            this.ensureSelectionValid();
            this.rebuildPreview();
            this.emitter.emit('changed', result);
        }
        return result;
    }

    get canUndo() {
        return this.commandStack.canUndo;
    }

    get canRedo() {
        return this.commandStack.canRedo;
    }

    setSelection(selection: SceneSelection) {
        this.selection = selection;
        this.emitter.emit('selectionChanged', selection);
    }

    private ensureSelectionValid() {
        if (this.selection.type === 'none') {
            return;
        }

        if (!findNode(this.scene, this.selection.node)) {
            this.selection = emptySelection;
            this.emitter.emit('selectionChanged', this.selection);
        }
    }

    serialize() {
        return JSON.stringify(this.scene, null, 2);
    }

    serializeState() {
        return JSON.stringify(this.getState(), null, 2);
    }

    getState(): SceneProjectState {
        return {
            version: 1,
            type: 'pixifact.aiEditorProject',
            scene: cloneScene(this.scene),
            selection: this.selection,
            designTokens: this.designTokens ? structuredClone(this.designTokens) : undefined,
            actions: structuredClone(this.actions),
            logicGraph: structuredClone(this.logicGraph),
            locks: structuredClone(this.locks),
            overrides: structuredClone(this.overrides),
            memory: structuredClone(this.memory),
            proposalHistory: structuredClone(this.proposalHistory),
        };
    }

    load(json: string | SceneSpec | SceneProjectState) {
        const parsed = typeof json === 'string'
            ? JSON.parse(json) as SceneSpec | SceneProjectState
            : json;

        if (isSceneProjectState(parsed)) {
            this.loadState(parsed);
            return;
        }

        this.scene = cloneScene(parsed);
        this.selection = emptySelection;
        this.designTokens = undefined;
        this.actions = [];
        this.logicGraph = createLogicGraph();
        this.locks = [];
        this.overrides = [];
        this.memory = [];
        this.proposalHistory = [];
        this.ensureSelectionValid();
        this.dirty = false;
        this.commandStack.clear();
        this.rebuildPreview();
        this.emitter.emit('loaded', this.scene);
    }

    loadState(state: SceneProjectState) {
        this.scene = cloneScene(state.scene);
        this.selection = state.selection ?? emptySelection;
        this.designTokens = state.designTokens ? structuredClone(state.designTokens) : undefined;
        this.actions = structuredClone(state.actions ?? []);
        this.logicGraph = state.logicGraph ? structuredClone(state.logicGraph) : createLogicGraph();
        this.locks = structuredClone(state.locks ?? []);
        this.overrides = structuredClone(state.overrides ?? []);
        this.memory = structuredClone(state.memory ?? []);
        this.proposalHistory = structuredClone(state.proposalHistory ?? []);
        this.ensureSelectionValid();
        this.dirty = false;
        this.commandStack.clear();
        this.rebuildPreview();
        this.emitter.emit('loaded', this.scene);
        this.emitter.emit('selectionChanged', this.selection);
    }

    rebuildPreview(context = this.previewContext, parent = this.previewParent) {
        this.previewContext = context;
        this.previewParent = parent;
        destroyRuntimePreview(this.preview);
        this.preview = createRuntimePreview(this.scene, parent, context);
        this.emitter.emit('previewRebuilt', this.preview);
        return this.preview;
    }

    getInspectorModel(node = this.selection.type === 'none' ? undefined : this.selection.node): InspectorNodeModel | undefined {
        if (!node) {
            return undefined;
        }
        return buildInspectorModel(this.scene, node);
    }

    clearPreview() {
        destroyRuntimePreview(this.preview);
        this.preview = undefined;
        this.previewParent = undefined;
    }

    destroy() {
        this.clearPreview();
        this.emitter.removeAllListeners();
    }
}
