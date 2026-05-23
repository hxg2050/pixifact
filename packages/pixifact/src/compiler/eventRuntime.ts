export type SceneEventListener<TPayload = void> = TPayload extends void
    ? () => void
    : (payload: TPayload) => void;

export interface SceneEvent<TPayload = void> {
    connect(listener: SceneEventListener<TPayload>): () => void;
    emit(...args: TPayload extends void ? [] : [TPayload]): void;
}

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
