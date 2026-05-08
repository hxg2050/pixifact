import { applyCommand } from "../commands";
import type { CommandResult, SceneCommand } from "../commands";
import type { SceneSpec } from "../scene";
import type { AiProposal } from "./AiProposal";
import { validateDesignTokenValue } from "./DesignToken";
import type { DesignTokenSpec, DesignTokenWarning } from "./DesignToken";
import { diffCommand } from "./DiffModel";
import type { DiffEntry } from "./DiffModel";
import { isLocked } from "./OverrideJournal";
import type { LockSpec } from "./OverrideJournal";
import type { ActionSpec } from "./ActionRegistry";

export interface ProposalRunOptions {
    locks?: readonly LockSpec[];
    designTokens?: DesignTokenSpec;
    actions?: readonly ActionSpec[];
}

export interface ProposalRunResult {
    ok: boolean;
    proposal: AiProposal;
    results: CommandResult[];
    diffs: DiffEntry[];
    warnings: DesignTokenWarning[];
    scene?: SceneSpec;
    error?: string;
}

function cloneScene(scene: SceneSpec): SceneSpec {
    return structuredClone(scene);
}

function lockedCommand(command: SceneCommand, locks: readonly LockSpec[] | undefined): string | undefined {
    if (command.op === 'batch') {
        for (const child of command.commands) {
            const locked = lockedCommand(child, locks);
            if (locked) {
                return locked;
            }
        }
    }

    if (command.op === 'setTransform') {
        for (const prop of Object.keys(command.values)) {
            if (isLocked(locks, { target: 'transform', node: command.node, prop })) {
                return `${command.node}.transform.${prop} is locked.`;
            }
        }
    }

    if (command.op === 'setNodeData' && isLocked(locks, {
        target: 'nodeData',
        node: command.node,
        field: command.field,
        prop: command.prop,
    })) {
        return `${command.node}.${command.field}.${command.prop} is locked.`;
    }

    if (command.op === 'setComponentProp' && isLocked(locks, {
        target: 'component',
        node: command.node,
        component: command.component,
        prop: command.prop,
    })) {
        return `${command.node}.${command.component}.${command.prop} is locked.`;
    }

    return undefined;
}

function commandTokenWarnings(command: SceneCommand, tokens: DesignTokenSpec | undefined): DesignTokenWarning[] {
    if (command.op === 'batch') {
        return command.commands.flatMap((child) => commandTokenWarnings(child, tokens));
    }

    if (command.op === 'setTransform') {
        return Object.entries(command.values)
            .map(([prop, value]) => validateDesignTokenValue(tokens, `${command.node}.transform.${prop}`, prop, value))
            .filter((warning): warning is DesignTokenWarning => !!warning);
    }

    if (command.op === 'setNodeData') {
        const target = `${command.node}.${command.field}.${command.prop}`;
        const warning = validateDesignTokenValue(tokens, target, command.prop, command.value);
        return warning ? [warning] : [];
    }

    if (command.op === 'setComponentProp') {
        const target = `${command.node}.${command.component}.${command.prop}`;
        const warning = validateDesignTokenValue(tokens, target, command.prop, command.value);
        return warning ? [warning] : [];
    }

    return [];
}

export function dryRunProposal(scene: SceneSpec, proposal: AiProposal, options: ProposalRunOptions = {}): ProposalRunResult {
    const draft = cloneScene(scene);
    const results: CommandResult[] = [];
    const diffs: DiffEntry[] = [];
    const warnings: DesignTokenWarning[] = [];

    for (const command of proposal.commands) {
        const locked = lockedCommand(command, options.locks);
        if (locked) {
            return {
                ok: false,
                proposal,
                results,
                diffs,
                warnings,
                error: locked,
            };
        }

        diffs.push(...diffCommand(draft, command));
        warnings.push(...commandTokenWarnings(command, options.designTokens));

        const result = applyCommand(draft, command, {
            actions: options.actions,
        });
        results.push(result);
        if (!result.ok) {
            return {
                ok: false,
                proposal,
                results,
                diffs,
                warnings,
                error: result.error,
            };
        }
    }

    return {
        ok: true,
        proposal,
        results,
        diffs,
        warnings,
        scene: draft,
    };
}
