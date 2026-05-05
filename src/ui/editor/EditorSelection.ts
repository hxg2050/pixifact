export type EditorSelection =
    | { type: 'none' }
    | { type: 'node'; node: string }
    | { type: 'component'; node: string; component: string };

export const emptySelection: EditorSelection = { type: 'none' };
