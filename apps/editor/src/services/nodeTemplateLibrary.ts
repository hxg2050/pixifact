import {
    container,
    image,
    input,
    shape,
    text,
} from 'pixifact';
import type { SceneDocument, NodeSpec } from 'pixifact';
import type { I18nKey } from '../i18n';
import { editorDragDataTypes } from './dragPayload';

export const nodeTemplateDragDataType = editorDragDataTypes.nodeTemplate;

export type LegacyNodeTemplateKind = 'container' | 'text' | 'image' | 'input' | 'shape';
export type PixiNodeTemplateKind =
    | 'pixi-container'
    | 'pixi-sprite'
    | 'pixi-nine-slice-sprite'
    | 'pixi-tiling-sprite'
    | 'pixi-text'
    | 'pixi-bitmap-text'
    | 'pixi-html-text'
    | 'pixi-graphics';
export type NodeTemplateKind = LegacyNodeTemplateKind | PixiNodeTemplateKind;

export interface NodeTemplateItem {
    kind: NodeTemplateKind;
    name: string;
    detail: string;
    nameKey: I18nKey;
    detailKey: I18nKey;
}

export const nodeTemplateLibrary: NodeTemplateItem[] = [
    { kind: 'container', name: '容器', detail: '可包含子节点', nameKey: 'basicGroupName', detailKey: 'basicGroupDetail' },
    { kind: 'image', name: '图片', detail: 'Image 节点', nameKey: 'basicImageName', detailKey: 'basicImageDetail' },
    { kind: 'text', name: '文字', detail: 'Text 节点', nameKey: 'basicTextName', detailKey: 'basicTextDetail' },
    { kind: 'input', name: '输入', detail: 'Input 节点', nameKey: 'basicInputName', detailKey: 'basicInputDetail' },
    { kind: 'shape', name: '形状', detail: 'Shape 节点', nameKey: 'basicShapeName', detailKey: 'basicShapeDetail' },
];

export const baseNodeLibrary = nodeTemplateLibrary;

export const pixiNodeTemplateLibrary: NodeTemplateItem[] = [
    { kind: 'pixi-container', name: 'Container', detail: 'PixiJS Container', nameKey: 'pixiContainerName', detailKey: 'pixiContainerDetail' },
    { kind: 'pixi-sprite', name: 'Sprite', detail: 'PixiJS Sprite', nameKey: 'pixiSpriteName', detailKey: 'pixiSpriteDetail' },
    { kind: 'pixi-nine-slice-sprite', name: 'NineSliceSprite', detail: 'PixiJS NineSliceSprite', nameKey: 'pixiNineSliceSpriteName', detailKey: 'pixiNineSliceSpriteDetail' },
    { kind: 'pixi-tiling-sprite', name: 'TilingSprite', detail: 'PixiJS TilingSprite', nameKey: 'pixiTilingSpriteName', detailKey: 'pixiTilingSpriteDetail' },
    { kind: 'pixi-text', name: 'Text', detail: 'PixiJS Text', nameKey: 'pixiTextName', detailKey: 'pixiTextDetail' },
    { kind: 'pixi-bitmap-text', name: 'BitmapText', detail: 'PixiJS BitmapText', nameKey: 'pixiBitmapTextName', detailKey: 'pixiBitmapTextDetail' },
    { kind: 'pixi-html-text', name: 'HTMLText', detail: 'PixiJS HTMLText', nameKey: 'pixiHtmlTextName', detailKey: 'pixiHtmlTextDetail' },
    { kind: 'pixi-graphics', name: 'Graphics', detail: 'PixiJS Graphics', nameKey: 'pixiGraphicsName', detailKey: 'pixiGraphicsDetail' },
];

function nodeKeyBase(kind: NodeTemplateKind) {
    switch (kind) {
        case 'text':
            return 'text';
        case 'image':
            return 'image';
        case 'input':
            return 'input';
        case 'shape':
            return 'shape';
        default:
            return 'container';
    }
}

function collectNodeKeys(node: NodeSpec, keys = new Set<string>()) {
    if (node.key) {
        keys.add(node.key);
    }
    if (node.id) {
        keys.add(node.id);
    }
    if (node.kind === 'container') {
        for (const child of node.children ?? []) {
            collectNodeKeys(child, keys);
        }
    }
    return keys;
}

function nextNodeKey(document: SceneDocument, kind: NodeTemplateKind) {
    const keys = collectNodeKeys(document.scene.root);
    const base = nodeKeyBase(kind);
    let index = 1;
    let key = `${base}${index}`;

    while (keys.has(key)) {
        index += 1;
        key = `${base}${index}`;
    }

    return { key, index };
}

export function createNodeTemplateNode(document: SceneDocument, kind: NodeTemplateKind): NodeSpec {
    const { key, index } = nextNodeKey(document, kind);

    switch (kind) {
        case 'text':
            return text(`文字${index}`, {
                key,
                width: 120,
                height: 28,
                value: '文字',
                color: 0x111827,
                fontSize: 16,
            });
        case 'image':
            return image(`图片${index}`, {
                key,
                width: 96,
                height: 96,
                mode: 'sprite',
                src: '',
                tint: 0xffffff,
            });
        case 'input':
            return input(`输入${index}`, {
                key,
                width: 160,
                height: 36,
                value: '',
                backgroundColor: 0xffffff,
                borderColor: 0x94a3b8,
                borderSize: 1,
                fontSize: 16,
            });
        case 'shape':
            return shape(`形状${index}`, {
                key,
                width: 100,
                height: 100,
                type: 'roundedRect',
                color: 0xe5e7eb,
                radius: 8,
            });
        default:
            return container(`容器${index}`, {
                key,
                width: 100,
                height: 100,
                children: [],
            });
    }
}

export function isNodeTemplateKind(value: string): value is NodeTemplateKind {
    return [...nodeTemplateLibrary, ...pixiNodeTemplateLibrary].some((item) => item.kind === value);
}

export function isLegacyNodeTemplateKind(value: string): value is LegacyNodeTemplateKind {
    return nodeTemplateLibrary.some((item) => item.kind === value);
}
