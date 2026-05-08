export const editorDragDataTypes = {
    basicComponent: 'application/x-pixifact-basic-component',
    component: 'application/x-pixifact-component',
    hierarchyNode: 'application/x-pixifact-hierarchy-node',
    scene: 'application/x-pixifact-scene',
} as const;

export type EditorDragDataType = typeof editorDragDataTypes[keyof typeof editorDragDataTypes];

export interface EditorDragPayload {
    data: string;
    label?: string;
    type: EditorDragDataType;
}

export function basicComponentDragPayload(kind: string, label?: string): EditorDragPayload {
    return {
        data: kind,
        label,
        type: editorDragDataTypes.basicComponent,
    };
}

export function componentDragPayload(componentType: string, label?: string): EditorDragPayload {
    return {
        data: componentType,
        label,
        type: editorDragDataTypes.component,
    };
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
