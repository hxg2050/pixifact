import type { AiProposal } from "./AiProposal";
import type { DiffEntry } from "./DiffModel";
import type { DesignTokenWarning } from "./DesignToken";

export type ProposalHistoryStatus = 'generated' | 'dryRunPassed' | 'dryRunFailed' | 'applied' | 'rejected';

export interface ProposalHistoryEntry {
    id: string;
    proposal: AiProposal;
    status: ProposalHistoryStatus;
    createdAt: number;
    updatedAt: number;
    error?: string;
    diffs?: DiffEntry[];
    warnings?: DesignTokenWarning[];
}

export function createProposalHistoryEntry(proposal: AiProposal, timestamp = Date.now()): ProposalHistoryEntry {
    return {
        id: proposal.id,
        proposal: structuredClone(proposal),
        status: 'generated',
        createdAt: timestamp,
        updatedAt: timestamp,
    };
}
