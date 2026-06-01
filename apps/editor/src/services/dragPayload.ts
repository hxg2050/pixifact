export const editorDragDataTypes = {
    hierarchyNode: 'application/x-pixifact-hierarchy-node',
    scene: 'application/x-pixifact-scene',
    asset: 'application/x-pixifact-asset',
} as const;

export type EditorDragDataType = typeof editorDragDataTypes[keyof typeof editorDragDataTypes];

export interface EditorDragPayload {
    data: string;
    label?: string;
    type: EditorDragDataType;
}

export function hierarchyNodeDragPayload(locator: string, label?: string): EditorDragPayload {
    return {
        data: locator,
        label,
        type: editorDragDataTypes.hierarchyNode,
    };
}

export function sceneDragPayload(path: string, label?: string): EditorDragPayload {
    return {
        data: path,
        label,
        type: editorDragDataTypes.scene,
    };
}
