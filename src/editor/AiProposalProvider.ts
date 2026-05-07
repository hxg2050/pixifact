import { createAiProposal } from "./AiProposal";
import type { AiProposal } from "./AiProposal";
import { createAiProposalRequest } from "./AiContext";
import type { AiModelConfig, AiProposalContext } from "./AiContext";
import { createMockAiProposal } from "./MockAiProposal";

export type { AiProposalContext } from "./AiContext";

export interface AiProposalProvider {
    generate(prompt: string, context: AiProposalContext): Promise<AiProposal>;
}

export type RemoteAiProposalHeaders =
    | Record<string, string>
    | (() => Record<string, string> | Promise<Record<string, string>>);

export interface RemoteAiProposalProviderOptions {
    endpoint: string;
    headers?: RemoteAiProposalHeaders;
    timeoutMs?: number;
    model?: AiModelConfig;
    fetch?: typeof fetch;
}

export class MockAiProposalProvider implements AiProposalProvider {
    async generate(prompt: string, context: AiProposalContext): Promise<AiProposal> {
        return createMockAiProposal(prompt, context);
    }
}

async function resolveHeaders(headers: RemoteAiProposalHeaders | undefined) {
    if (!headers) {
        return {};
    }
    return typeof headers === 'function' ? headers() : headers;
}

function normalizeRemoteProposal(prompt: string, payload: unknown): AiProposal {
    const candidate = Array.isArray(payload)
        ? { prompt, commands: payload }
        : typeof payload === 'object' && payload !== null && 'proposal' in payload
            ? (payload as { proposal: unknown }).proposal
            : payload;

    if (typeof candidate !== 'object' || candidate === null) {
        throw new Error('Remote AI response must be an AiProposal object or command array.');
    }

    const proposal = candidate as Partial<AiProposal>;
    if (!Array.isArray(proposal.commands)) {
        throw new Error('Remote AI response did not include a commands array.');
    }

    return createAiProposal({
        id: proposal.id,
        prompt: proposal.prompt ?? prompt,
        explanation: proposal.explanation,
        commands: proposal.commands,
        annotations: proposal.annotations,
        risks: proposal.risks,
    });
}

export class RemoteAiProposalProvider implements AiProposalProvider {
    constructor(private readonly options: RemoteAiProposalProviderOptions) {}

    async generate(prompt: string, context: AiProposalContext): Promise<AiProposal> {
        const fetchImpl = this.options.fetch ?? globalThis.fetch;
        if (!fetchImpl) {
            throw new Error('RemoteAiProposalProvider requires fetch or options.fetch.');
        }

        const timeoutMs = this.options.timeoutMs;
        const controller = timeoutMs && timeoutMs > 0 ? new AbortController() : undefined;
        const timeout = controller
            ? setTimeout(() => controller.abort(), timeoutMs)
            : undefined;

        let response: Response;
        try {
            response = await fetchImpl(this.options.endpoint, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    ...await resolveHeaders(this.options.headers),
                },
                body: JSON.stringify(createAiProposalRequest(prompt, context, {
                    model: this.options.model,
                })),
                signal: controller?.signal,
            });
        } catch (error) {
            if (controller?.signal.aborted) {
                throw new Error(`Remote AI provider timed out after ${timeoutMs}ms.`);
            }
            throw error;
        } finally {
            if (timeout) {
                clearTimeout(timeout);
            }
        }

        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new Error(`Remote AI provider failed with ${response.status}${detail ? `: ${detail}` : ''}`);
        }

        return normalizeRemoteProposal(prompt, await response.json());
    }
}
