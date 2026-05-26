import type { OverrideSpec } from "./OverrideJournal";

export interface PreferenceMemory {
    id: string;
    context: string;
    pattern: string;
    before?: unknown;
    after: unknown;
    reason?: string;
    confidence: number;
    enabled?: boolean;
    source?: 'manual' | 'imported' | 'agent';
}

export interface MemorySuggestion {
    id: string;
    memory: PreferenceMemory;
    sourceOverride: OverrideSpec;
}

function propFromTarget(target: string) {
    const parts = target.split('.');
    return parts.at(-1) ?? target;
}

export function createMemorySuggestion(override: OverrideSpec): MemorySuggestion | undefined {
    if (override.source !== 'manual') {
        return undefined;
    }

    const prop = propFromTarget(override.target);
    return {
        id: `suggestion-${override.timestamp}-${override.target}`,
        sourceOverride: override,
        memory: {
            id: `memory-${override.timestamp}-${override.target}`,
            context: override.target,
            pattern: `When editing ${override.target}, prefer ${prop}=${JSON.stringify(override.after)}.`,
            before: override.before,
            after: override.after,
            reason: override.reason,
            confidence: 0.5,
            enabled: true,
            source: 'manual',
        },
    };
}

export function createMemorySuggestions(overrides: readonly OverrideSpec[]) {
    return overrides
        .map(createMemorySuggestion)
        .filter((suggestion): suggestion is MemorySuggestion => !!suggestion);
}

export function summarizeMemoryForAgent(memory: readonly PreferenceMemory[]) {
    return memory
        .filter((item) => item.enabled !== false)
        .map((item) => `- ${item.pattern}`)
        .join('\n');
}

export function enabledMemory(memory: readonly PreferenceMemory[]) {
    return memory.filter((item) => item.enabled !== false);
}
