import type { SceneTemplatePrimitiveType, SceneTemplateValue } from './spec';

export type PixiSceneNodeType = Extract<
    SceneTemplatePrimitiveType,
    'Container' | 'Sprite' | 'NineSliceSprite' | 'TilingSprite' | 'Text' | 'BitmapText' | 'HTMLText' | 'Graphics'
>;

export type PixiSceneFieldType = 'string' | 'number' | 'boolean' | 'color' | 'enum';
export type PixiScenePropGroup = 'transform' | 'display' | 'sprite' | 'nineSlice' | 'tiling' | 'text' | 'graphics';

export interface PixiSceneFieldSchema {
    key: string;
    type: PixiSceneFieldType;
    options?: readonly (string | number)[];
}

export interface PixiSceneNodeSchema {
    type: PixiSceneNodeType;
    acceptsChildren: boolean;
    defaults: Record<string, SceneTemplateValue>;
    groups: Partial<Record<PixiScenePropGroup, readonly string[]>>;
}

export const pixiSceneTransformProps = [
    'x',
    'y',
    'width',
    'height',
    'scaleX',
    'scaleY',
    'rotation',
    'pivotX',
    'pivotY',
    'skewX',
    'skewY',
] as const;

export const pixiSceneDisplayProps = [
    'alpha',
    'visible',
    'zIndex',
    'eventMode',
    'cursor',
    'label',
] as const;

export const pixiSceneSpriteProps = [
    'texture',
    'anchorX',
    'anchorY',
    'tint',
] as const;

export const pixiSceneNineSliceProps = [
    'leftWidth',
    'rightWidth',
    'topHeight',
    'bottomHeight',
] as const;

export const pixiSceneTilingProps = [
    'tilePositionX',
    'tilePositionY',
    'tileScaleX',
    'tileScaleY',
    'tileRotation',
] as const;

export const pixiSceneTextProps = [
    'text',
    'fontSize',
    'fontFamily',
    'fontWeight',
    'fill',
] as const;

export const pixiSceneGraphicsProps = [
    'shape',
    'radius',
    'fill',
    'fillAlpha',
    'strokeColor',
    'strokeWidth',
    'strokeAlpha',
] as const;

export const pixiSceneTextStyleProps = [
    'fontSize',
    'fontFamily',
    'fontWeight',
    'fill',
] as const;

export const pixiSceneSpriteLikeProps = [
    ...pixiSceneSpriteProps,
    ...pixiSceneNineSliceProps,
    ...pixiSceneTilingProps,
] as const;

export const pixiSceneKnownProps = [
    ...pixiSceneTransformProps,
    ...pixiSceneDisplayProps,
    ...pixiSceneSpriteLikeProps,
    ...pixiSceneTextProps,
    ...pixiSceneGraphicsProps,
] as const;

export const pixiSceneAddableNodeTypes = [
    'Container',
    'Sprite',
    'NineSliceSprite',
    'TilingSprite',
    'Text',
    'BitmapText',
    'HTMLText',
    'Graphics',
] as const satisfies readonly PixiSceneNodeType[];

const pixiSceneFieldSchemas: Partial<Record<string, PixiSceneFieldSchema>> = {
    x: { key: 'x', type: 'number' },
    y: { key: 'y', type: 'number' },
    width: { key: 'width', type: 'number' },
    height: { key: 'height', type: 'number' },
    scaleX: { key: 'scaleX', type: 'number' },
    scaleY: { key: 'scaleY', type: 'number' },
    rotation: { key: 'rotation', type: 'number' },
    pivotX: { key: 'pivotX', type: 'number' },
    pivotY: { key: 'pivotY', type: 'number' },
    skewX: { key: 'skewX', type: 'number' },
    skewY: { key: 'skewY', type: 'number' },
    alpha: { key: 'alpha', type: 'number' },
    visible: { key: 'visible', type: 'boolean' },
    zIndex: { key: 'zIndex', type: 'number' },
    eventMode: { key: 'eventMode', type: 'enum', options: ['none', 'passive', 'auto', 'static', 'dynamic'] },
    cursor: { key: 'cursor', type: 'enum', options: ['default', 'pointer', 'text', 'grab', 'grabbing'] },
    label: { key: 'label', type: 'string' },
    texture: { key: 'texture', type: 'string' },
    anchorX: { key: 'anchorX', type: 'number' },
    anchorY: { key: 'anchorY', type: 'number' },
    tint: { key: 'tint', type: 'color' },
    leftWidth: { key: 'leftWidth', type: 'number' },
    rightWidth: { key: 'rightWidth', type: 'number' },
    topHeight: { key: 'topHeight', type: 'number' },
    bottomHeight: { key: 'bottomHeight', type: 'number' },
    tilePositionX: { key: 'tilePositionX', type: 'number' },
    tilePositionY: { key: 'tilePositionY', type: 'number' },
    tileScaleX: { key: 'tileScaleX', type: 'number' },
    tileScaleY: { key: 'tileScaleY', type: 'number' },
    tileRotation: { key: 'tileRotation', type: 'number' },
    text: { key: 'text', type: 'string' },
    fontSize: { key: 'fontSize', type: 'number' },
    fontFamily: { key: 'fontFamily', type: 'string' },
    fontWeight: { key: 'fontWeight', type: 'enum', options: ['400', '500', '600', '700', 'bold'] },
    fill: { key: 'fill', type: 'color' },
    shape: { key: 'shape', type: 'enum', options: ['roundRect', 'rect'] },
    radius: { key: 'radius', type: 'number' },
    fillAlpha: { key: 'fillAlpha', type: 'number' },
    strokeColor: { key: 'strokeColor', type: 'color' },
    strokeWidth: { key: 'strokeWidth', type: 'number' },
    strokeAlpha: { key: 'strokeAlpha', type: 'number' },
};

const pixiSceneNodeSchemas: Record<PixiSceneNodeType, PixiSceneNodeSchema> = {
    Container: {
        type: 'Container',
        acceptsChildren: true,
        defaults: {
            width: 100,
            height: 100,
        },
        groups: {},
    },
    Sprite: {
        type: 'Sprite',
        acceptsChildren: false,
        defaults: {
            width: 96,
            height: 96,
        },
        groups: {
            sprite: pixiSceneSpriteProps,
        },
    },
    NineSliceSprite: {
        type: 'NineSliceSprite',
        acceptsChildren: false,
        defaults: {
            width: 160,
            height: 80,
            leftWidth: 10,
            rightWidth: 10,
            topHeight: 10,
            bottomHeight: 10,
        },
        groups: {
            sprite: pixiSceneSpriteProps,
            nineSlice: pixiSceneNineSliceProps,
        },
    },
    TilingSprite: {
        type: 'TilingSprite',
        acceptsChildren: false,
        defaults: {
            width: 160,
            height: 96,
            tileScaleX: 1,
            tileScaleY: 1,
        },
        groups: {
            sprite: pixiSceneSpriteProps,
            tiling: pixiSceneTilingProps,
        },
    },
    Text: {
        type: 'Text',
        acceptsChildren: false,
        defaults: {
            text: 'Text',
            width: 120,
            height: 28,
            fontSize: 16,
            fill: 0x111827,
        },
        groups: {
            text: pixiSceneTextProps,
        },
    },
    BitmapText: {
        type: 'BitmapText',
        acceptsChildren: false,
        defaults: {
            text: 'Text',
            width: 120,
            height: 28,
            fontSize: 16,
            fill: 0x111827,
        },
        groups: {
            text: pixiSceneTextProps,
        },
    },
    HTMLText: {
        type: 'HTMLText',
        acceptsChildren: false,
        defaults: {
            text: 'Text',
            width: 120,
            height: 28,
            fontSize: 16,
            fill: 0x111827,
        },
        groups: {
            text: pixiSceneTextProps,
        },
    },
    Graphics: {
        type: 'Graphics',
        acceptsChildren: false,
        defaults: {
            shape: 'roundRect',
            width: 100,
            height: 60,
            radius: 8,
            fill: 0xe5e7eb,
        },
        groups: {
            graphics: pixiSceneGraphicsProps,
        },
    },
};

export function pixiSceneNodeSchema(type: PixiSceneNodeType) {
    return pixiSceneNodeSchemas[type];
}

export function isPixiSceneNodeType(type: SceneTemplatePrimitiveType): type is PixiSceneNodeType {
    return (pixiSceneAddableNodeTypes as readonly SceneTemplatePrimitiveType[]).includes(type);
}

export function pixiSceneNodeDefaults(type: PixiSceneNodeType) {
    return { ...pixiSceneNodeSchemas[type].defaults };
}

export function pixiSceneNodeAcceptsChildren(type: SceneTemplatePrimitiveType) {
    return isPixiSceneNodeType(type) && pixiSceneNodeSchemas[type].acceptsChildren;
}

export function pixiSceneNodePropKeys(type: PixiSceneNodeType) {
    return Object.values(pixiSceneNodeSchemas[type].groups).flat();
}

export function pixiSceneFieldSchema(key: string) {
    return pixiSceneFieldSchemas[key];
}
