import type { ComponentSpec, NodeSpec, RectTransformSpec, SceneNodeKind } from "../scene";

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

export interface SetNodeDataCommand {
    op: 'setNodeData';
    node: string;
    field: Exclude<SceneNodeKind, 'container'>;
    prop: string;
    value: unknown;
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
    commands: SceneCommand[];
}

export type SceneCommand =
    | SetNodePropCommand
    | SetTransformCommand
    | SetNodeDataCommand
    | SetComponentPropCommand
    | AddComponentCommand
    | RemoveComponentCommand
    | CreateNodeCommand
    | DeleteNodeCommand
    | ReparentNodeCommand
    | ReorderNodeCommand
    | BatchCommand;
