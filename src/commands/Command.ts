import type { ComponentSpec, NodeSpec, RectTransformSpec } from "../prefab";

export interface SetNodePropCommand {
    op: 'setNodeProp';
    node: string;
    prop: 'id' | 'key' | 'role' | 'name';
    value: string | undefined;
}

export interface SetTransformCommand {
    op: 'setTransform';
    node: string;
    values: Partial<RectTransformSpec>;
}

export interface SetComponentPropCommand {
    op: 'setComponentProp';
    node: string;
    component: string;
    prop: string;
    value: unknown;
}

export interface AddComponentCommand {
    op: 'addComponent';
    node: string;
    component: ComponentSpec;
    index?: number;
}

export interface RemoveComponentCommand {
    op: 'removeComponent';
    node: string;
    component: string;
}

export interface CreateNodeCommand {
    op: 'createNode';
    parent?: string;
    node: NodeSpec;
    index?: number;
}

export interface DeleteNodeCommand {
    op: 'deleteNode';
    node: string;
}

export interface ReparentNodeCommand {
    op: 'reparentNode';
    node: string;
    parent?: string;
    index?: number;
}

export interface ReorderNodeCommand {
    op: 'reorderNode';
    node: string;
    index: number;
}

export interface BatchCommand {
    op: 'batch';
    commands: EditorCommand[];
}

export type EditorCommand =
    | SetNodePropCommand
    | SetTransformCommand
    | SetComponentPropCommand
    | AddComponentCommand
    | RemoveComponentCommand
    | CreateNodeCommand
    | DeleteNodeCommand
    | ReparentNodeCommand
    | ReorderNodeCommand
    | BatchCommand;
