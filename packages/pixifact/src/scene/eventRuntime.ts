export type SceneEventListener<TPayload = void> = TPayload extends void
    ? () => void
    : (payload: TPayload) => void;

export interface SceneEvent<TPayload = void> {
    connect(listener: SceneEventListener<TPayload>): () => void;
    emit(...args: TPayload extends void ? [] : [TPayload]): void;
}

export type SceneActions = Record<string, (() => void) | undefined>;

export function createEvent<TPayload = void>(): SceneEvent<TPayload> {
    const listeners = new Set<SceneEventListener<TPayload>>();

    return {
        connect(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        emit(...args) {
            for (const listener of listeners) {
                (listener as (...payload: typeof args) => void)(...args);
            }
        },
    };
}

export function connectSceneEvent(
    event: SceneEvent,
    actionName: string,
    owner: object,
    actions: SceneActions = {},
) {
    const action = actions[actionName];
    if (action) {
        return event.connect(action);
    }

    const ownerAction = (owner as Record<string, unknown>)[actionName];
    if (typeof ownerAction === 'function') {
        return event.connect(() => {
            ownerAction.call(owner);
        });
    }

    throw new Error(`Scene action "${actionName}" was not found.`);
}
