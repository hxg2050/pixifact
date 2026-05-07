import type { EditorCommand } from "../commands";

export interface AiAnnotation {
    node?: string;
    component?: string;
    prop?: string;
    message: string;
}

export interface AiProposal {
    id: string;
    prompt: string;
    explanation: string;
    commands: EditorCommand[];
    annotations?: AiAnnotation[];
    risks?: string[];
}

export function createAiProposal(input: Partial<AiProposal> & { commands: EditorCommand[] }): AiProposal {
    return {
        id: input.id ?? `proposal-${Date.now()}`,
        prompt: input.prompt ?? '',
        explanation: input.explanation ?? '',
        commands: input.commands,
        annotations: input.annotations ?? [],
        risks: input.risks ?? [],
    };
}
