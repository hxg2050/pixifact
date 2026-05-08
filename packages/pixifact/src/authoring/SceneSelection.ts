export type SceneSelection =
    | { type: 'none' }
    | { type: 'node'; node: string }
    | { type: 'component'; node: string; component: string };

export const emptySelection: SceneSelection = { type: 'none' };
