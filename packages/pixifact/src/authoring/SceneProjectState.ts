import type { SceneSpec } from "../scene";
import type { DesignTokenSpec } from "./DesignToken";
import type { SceneSelection } from "./SceneSelection";
import type { LockSpec, OverrideSpec } from "./OverrideJournal";
import type { PreferenceMemory } from "./PreferenceMemory";
import type { ActionSpec } from "./ActionRegistry";
import type { LogicGraphSpec } from "./LogicGraph";

export interface SceneProjectState {
    version: 1;
    type: 'pixifact.aiEditorProject';
    scene: SceneSpec;
    selection?: SceneSelection;
    designTokens?: DesignTokenSpec;
    actions: ActionSpec[];
    logicGraph?: LogicGraphSpec;
    locks: LockSpec[];
    overrides: OverrideSpec[];
    memory: PreferenceMemory[];
}

export function isSceneProjectState(value: unknown): value is SceneProjectState {
    return typeof value === 'object'
        && value !== null
        && (value as { type?: unknown }).type === 'pixifact.aiEditorProject'
        && (value as { version?: unknown }).version === 1
        && typeof (value as { scene?: unknown }).scene === 'object'
        && (value as { scene?: { type?: unknown } }).scene?.type === 'scene';
}
