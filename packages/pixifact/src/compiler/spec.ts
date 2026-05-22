export type SceneTemplatePrimitiveType =
    | 'Container'
    | 'Sprite'
    | 'Text'
    | 'Graphics'
    | 'BitmapText'
    | 'HTMLText'
    | 'Mesh'
    | 'NineSliceSprite'
    | 'TilingSprite'
    | 'DOMContainer';

export type SceneTemplateValue = string | number | boolean;

export interface SceneTemplateScript {
    path: string;
    className: string;
}

export interface SceneTemplatePropContract {
    type: string;
    default?: SceneTemplateValue;
}

export interface SceneTemplateEventContract {
    type: 'action';
}

export interface SceneTemplateSlotContract {
    multiple: boolean;
}

export interface SceneTemplateInterface {
    props: Record<string, SceneTemplatePropContract>;
    events: Record<string, SceneTemplateEventContract>;
    slots: Record<string, SceneTemplateSlotContract>;
}

export interface SceneTemplate {
    version: 2;
    name: string;
    script?: SceneTemplateScript;
    interface: SceneTemplateInterface;
    root: SceneTemplateNode;
}

export type SceneTemplateNode =
    | PixiTemplateNode
    | SceneInstanceTemplateNode
    | SlotOutletTemplateNode;

export interface PixiTemplateNode {
    kind: 'pixi';
    type: SceneTemplatePrimitiveType;
    key?: string;
    props: Record<string, SceneTemplateValue>;
    children: SceneTemplateNode[];
}

export interface SceneInstanceTemplateNode {
    kind: 'sceneInstance';
    type: string;
    key?: string;
    scene: string;
    props: Record<string, SceneTemplateValue>;
    events: Record<string, string>;
    slots: Record<string, SceneTemplateNode[]>;
}

export interface SlotOutletTemplateNode {
    kind: 'slotOutlet';
    name: string;
}

export interface CompileSceneTemplateOptions {
    functionName?: string;
    actionsParameter?: string;
}

export interface SceneScriptInterface {
    scene: string;
    className: string;
    interface: SceneTemplateInterface;
}
