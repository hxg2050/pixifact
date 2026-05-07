export const editorDragDataTypes = {
    basicComponent: 'application/x-pixifact-basic-component',
    component: 'application/x-pixifact-component',
    prefab: 'application/x-pixifact-prefab',
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

export function prefabDragPayload(path: string, label?: string): EditorDragPayload {
    return {
        data: path,
        label,
        type: editorDragDataTypes.prefab,
    };
}
