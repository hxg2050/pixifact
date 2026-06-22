export type SceneTemplatePrimitiveType =
    | 'Container'
    | 'Sprite'
    | 'Text'
    | 'Graphics'
    | 'Rect'
    | 'Image'
    | 'NineImage'
    | 'TileImage'
    | 'BitmapText'
    | 'HTMLText'
    | 'Mesh'
    | 'NineSliceSprite'
    | 'TilingSprite'
    | 'DOMContainer'
    | 'HBoxContainer'
    | 'ScrollContainer'
    | 'VBoxContainer';

export type SceneTemplateScalarValue = string | number | boolean;
export type SceneTemplateStructValue = Record<string, SceneTemplateScalarValue>;
export type SceneTemplateValue = SceneTemplateScalarValue | SceneTemplateStructValue;

export type SceneTemplatePrimitivePropType = 'string' | 'number' | 'boolean';

export interface SceneTemplatePrimitivePropContract {
    type: SceneTemplatePrimitivePropType;
    default?: SceneTemplateScalarValue;
}

export interface SceneTemplateStructFieldContract {
    type: SceneTemplatePrimitivePropType;
    default: SceneTemplateScalarValue;
}

export interface SceneTemplateStructPropContract {
    type: 'struct';
    struct: string;
    sourceScene?: string;
    fields: Record<string, SceneTemplateStructFieldContract>;
}

export type SceneTemplatePropContract =
    | SceneTemplatePrimitivePropContract
    | SceneTemplateStructPropContract;

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

export interface SceneTemplateScriptImport {
    scene?: string;
    exportName: string;
    localName: string;
    source: string;
}

export interface CompileSceneTemplateOptions {
    functionName?: string;
    actionsParameter?: string;
    registrationPath?: string;
    defaultRootSize?: {
        width: number;
        height: number;
    };
    scriptImport?: SceneTemplateScriptImport;
    sceneImports?: SceneTemplateScriptImport[];
    sceneClassAliases?: Record<string, string>;
    sceneInterfaces?: Record<string, SceneTemplateInterface>;
    textureImports?: Record<string, string>;
}

export interface SceneScriptInterface {
    scene: string;
    className: string;
    interface: SceneTemplateInterface;
    parts: Record<string, string>;
}

export type SceneClassDecorator = ClassDecorator;
export type SceneMemberDecorator = PropertyDecorator & MethodDecorator;
export type SceneStructConstructor = new () => object;
export type ScenePropType = StringConstructor | NumberConstructor | BooleanConstructor | SceneStructConstructor;

export interface ScenePropDecoratorOptions {
    type: ScenePropType;
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
