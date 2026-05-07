import type { EditorCommand } from "../commands";
import type { AiProposalContext, AiProposalProvider } from "./AiProposalProvider";
import type { AiProposal } from "./AiProposal";
import type { EditorDocument } from "./EditorDocument";
import { dryRunProposal } from "./ProposalRunner";
import type { ProposalRunResult } from "./ProposalRunner";

export interface AiExecutionOptions {
    maxAttempts: number;
}

export interface AiExecutionAttempt {
    attempt: number;
    prompt: string;
    proposal: AiProposal;
    run: ProposalRunResult;
    applied: boolean;
    applyError?: string;
}

export type AiExecutionResult =
    | {
        ok: true;
        prompt: string;
        proposal: AiProposal;
        run: ProposalRunResult;
        attempts: AiExecutionAttempt[];
        applied: true;
    }
    | {
        ok: false;
        prompt: string;
        proposal: AiProposal;
        run: ProposalRunResult;
        attempts: AiExecutionAttempt[];
        applied: false;
        error: string;
    };

export function createDocumentAiProposalContext(document: EditorDocument): AiProposalContext {
    return {
        prefab: document.prefab,
        selection: document.selection.type === 'node' ? document.selection.node : undefined,
        designTokens: document.designTokens,
        actions: document.actions,
        logicGraph: document.logicGraph,
        locks: document.locks,
        memory: document.memory,
    };
}

function commandsJson(commands: readonly EditorCommand[]) {
    return JSON.stringify(commands, null, 2);
}

export function createAiRepairPrompt(
    originalPrompt: string,
    failedProposal: AiProposal,
    failedRun: ProposalRunResult,
) {
    return [
        originalPrompt,
        '',
        '上一次返回的 EditorCommand 未通过 Pixifact 校验。请修正 command，并只返回新的 AiProposal JSON。',
        `失败原因：${failedRun.error ?? 'Command validation failed.'}`,
        `失败 proposal：${failedProposal.id}`,
        '失败 commands：',
        commandsJson(failedProposal.commands),
        '',
        '保留用户原始意图；必须使用当前 context 中存在的节点、组件、动作和 component schema。',
    ].join('\n');
}

function dryRunOptions(document: EditorDocument) {
    return {
        locks: document.locks,
        designTokens: document.designTokens,
        actions: document.actions,
    };
}

function applyProposal(document: EditorDocument, proposal: AiProposal) {
    if (proposal.commands.length === 0) {
        return { ok: true as const };
    }

    return document.apply({
        op: 'batch',
        commands: proposal.commands,
    }, 'ai');
}

export async function executeAiPrompt(
    document: EditorDocument,
    provider: AiProposalProvider,
    prompt: string,
    options: AiExecutionOptions,
): Promise<AiExecutionResult> {
    const attempts: AiExecutionAttempt[] = [];
    let currentPrompt = prompt;

    for (let index = 0; index < options.maxAttempts; index++) {
        const proposal = await provider.generate(currentPrompt, createDocumentAiProposalContext(document));
        const run = dryRunProposal(document.prefab, proposal, dryRunOptions(document));

        document.recordProposal(proposal);
        document.recordProposalRun(run);

        if (run.ok) {
            const applyResult = applyProposal(document, proposal);
            const applied = applyResult.ok;
            const attempt: AiExecutionAttempt = {
                attempt: index + 1,
                prompt: currentPrompt,
                proposal,
                run,
                applied,
                applyError: applied ? undefined : applyResult.error,
            };
            attempts.push(attempt);

            if (applied) {
                document.markProposalApplied(proposal);
                return {
                    ok: true,
                    prompt,
                    proposal,
                    run,
                    attempts,
                    applied: true,
                };
            }

            document.markProposalRejected(proposal);
            return {
                ok: false,
                prompt,
                proposal,
                run,
                attempts,
                applied: false,
                error: applyResult.error,
            };
        }

        attempts.push({
            attempt: index + 1,
            prompt: currentPrompt,
            proposal,
            run,
            applied: false,
        });

        if (index < options.maxAttempts - 1) {
            currentPrompt = createAiRepairPrompt(prompt, proposal, run);
        }
    }

    const lastAttempt = attempts[attempts.length - 1];
    document.markProposalRejected(lastAttempt.proposal);

    return {
        ok: false,
        prompt,
        proposal: lastAttempt.proposal,
        run: lastAttempt.run,
        attempts,
        applied: false,
        error: lastAttempt.run.error ?? 'AI did not produce a valid command.',
    };
}
