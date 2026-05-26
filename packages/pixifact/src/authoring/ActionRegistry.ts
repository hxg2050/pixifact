export interface ActionSpec {
    key: string;
    label?: string;
    description?: string;
    source?: 'manual' | 'agent' | 'code';
}

export function actionExists(actions: readonly ActionSpec[] | undefined, key: string) {
    return (actions ?? []).some((action) => action.key === key);
}

export function upsertAction(actions: ActionSpec[], action: ActionSpec) {
    const existing = actions.find((item) => item.key === action.key);
    if (existing) {
        Object.assign(existing, action);
        return existing;
    }
    actions.push(action);
    return action;
}

export function createRuntimeActions(actions: readonly ActionSpec[] | undefined, handler?: (action: ActionSpec, args: unknown[]) => void) {
    const runtimeActions: Record<string, (...args: unknown[]) => void> = {};
    for (const action of actions ?? []) {
        runtimeActions[action.key] = (...args: unknown[]) => {
            handler?.(action, args);
        };
    }
    return runtimeActions;
}

export function summarizeActionsForAgent(actions: readonly ActionSpec[] | undefined) {
    return (actions ?? [])
        .map((action) => `- ${action.key}${action.label ? ` (${action.label})` : ''}${action.description ? `: ${action.description}` : ''}`)
        .join('\n');
}
