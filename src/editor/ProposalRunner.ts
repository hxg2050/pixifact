import { applyCommand } from "../commands";
import type { CommandResult, EditorCommand } from "../commands";
import type { PrefabSpec } from "../prefab";
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
    prefab?: PrefabSpec;
    error?: string;
}

function clonePrefab(prefab: PrefabSpec): PrefabSpec {
    return structuredClone(prefab);
}

function lockedCommand(command: EditorCommand, locks: readonly LockSpec[] | undefined): string | undefined {
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

function commandTokenWarnings(command: EditorCommand, tokens: DesignTokenSpec | undefined): DesignTokenWarning[] {
    if (command.op === 'batch') {
        return command.commands.flatMap((child) => commandTokenWarnings(child, tokens));
    }

    if (command.op === 'setTransform') {
        return Object.entries(command.values)
            .map(([prop, value]) => validateDesignTokenValue(tokens, `${command.node}.transform.${prop}`, prop, value))
            .filter((warning): warning is DesignTokenWarning => !!warning);
    }

    if (command.op === 'setComponentProp') {
        const target = `${command.node}.${command.component}.${command.prop}`;
        const warning = validateDesignTokenValue(tokens, target, command.prop, command.value);
        return warning ? [warning] : [];
    }

    return [];
}

export function dryRunProposal(prefab: PrefabSpec, proposal: AiProposal, options: ProposalRunOptions = {}): ProposalRunResult {
    const draft = clonePrefab(prefab);
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
        prefab: draft,
    };
}
