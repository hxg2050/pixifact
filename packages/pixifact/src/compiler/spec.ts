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
    props: Record<string, SceneTemplateValue>;
    interface: SceneTemplateInterface;
    children: SceneTemplateNode[];
}

export type SceneTemplateNode =
    | PixiTemplateNode
    | SceneInstanceTemplateNode
    | SlotOutletTemplateNode;

export interface PixiTemplateNode {
    kind: 'pixi';
    type: SceneTemplatePrimitiveType;
    id?: string;
    props: Record<string, SceneTemplateValue>;
    children: SceneTemplateNode[];
}

export interface SceneInstanceTemplateNode {
    kind: 'sceneInstance';
    type: string;
    id?: string;
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
    registrationPath?: string;
    sceneImports?: Record<string, string>;
}

export interface SceneScriptInterface {
    scene: string;
    className: string;
    interface: SceneTemplateInterface;
    parts: Record<string, string>;
}

export type SceneClassDecorator = ClassDecorator;
export type SceneMemberDecorator = PropertyDecorator & MethodDecorator;

export interface SceneDecoratorOptions {
    scene: string;
}

export interface ScenePropDecoratorOptions {
    type: string;
    default?: SceneTemplateValue;
}

export interface SceneEventDecoratorOptions {
    name?: string;
}

export interface SceneSlotDecoratorOptions {
    name?: string;
}

export interface ScenePartDecoratorOptions {
    id?: string;
}
