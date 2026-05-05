import type { PrefabSpec } from "../prefab";
import type { DesignTokenSpec } from "./DesignToken";
import type { EditorSelection } from "./EditorSelection";
import type { LockSpec, OverrideSpec } from "./OverrideJournal";
import type { PreferenceMemory } from "./PreferenceMemory";
import type { ProposalHistoryEntry } from "./ProposalHistory";
import type { ActionSpec } from "./ActionRegistry";
import type { LogicGraphSpec } from "./LogicGraph";

export interface EditorProjectState {
    version: 1;
    type: 'pixif.aiEditorProject';
    prefab: PrefabSpec;
    selection?: EditorSelection;
    designTokens?: DesignTokenSpec;
    actions: ActionSpec[];
    logicGraph?: LogicGraphSpec;
    locks: LockSpec[];
    overrides: OverrideSpec[];
    memory: PreferenceMemory[];
    proposalHistory: ProposalHistoryEntry[];
}

export function isEditorProjectState(value: unknown): value is EditorProjectState {
    return typeof value === 'object'
        && value !== null
        && (value as { type?: unknown }).type === 'pixif.aiEditorProject'
        && (value as { version?: unknown }).version === 1
        && typeof (value as { prefab?: unknown }).prefab === 'object'
        && (value as { prefab?: { type?: unknown } }).prefab?.type === 'prefab';
}
