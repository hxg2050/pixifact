import {
    buttonScene,
    container,
    image,
    input,
    progressBarScene,
    scrollViewScene,
    shape,
    text,
} from 'pixifact';
import type { SceneDocument, NodeSpec } from 'pixifact';
import type { I18nKey } from '../i18n';
import { editorDragDataTypes } from './dragPayload';

export const basicComponentDragDataType = editorDragDataTypes.basicComponent;

export type BasicComponentKind = 'container' | 'button' | 'progressBar' | 'scrollView' | 'text' | 'image' | 'input' | 'shape';

export interface BasicComponentItem {
    kind: BasicComponentKind;
    name: string;
    detail: string;
    nameKey: I18nKey;
    detailKey: I18nKey;
    group: 'node' | 'template';
}

export const basicComponentLibrary: BasicComponentItem[] = [
    { kind: 'container', name: '容器', detail: '可包含子节点', nameKey: 'basicGroupName', detailKey: 'basicGroupDetail', group: 'node' },
    { kind: 'image', name: '图片', detail: 'Image 节点', nameKey: 'basicImageName', detailKey: 'basicImageDetail', group: 'node' },
    { kind: 'text', name: '文字', detail: 'Text 节点', nameKey: 'basicTextName', detailKey: 'basicTextDetail', group: 'node' },
    { kind: 'input', name: '输入', detail: 'Input 节点', nameKey: 'basicInputName', detailKey: 'basicInputDetail', group: 'node' },
    { kind: 'shape', name: '形状', detail: 'Shape 节点', nameKey: 'basicShapeName', detailKey: 'basicShapeDetail', group: 'node' },
    { kind: 'button', name: '按钮', detail: 'Scene 模板', nameKey: 'basicButtonName', detailKey: 'basicButtonDetail', group: 'template' },
    { kind: 'progressBar', name: '进度条', detail: 'Scene 模板', nameKey: 'basicProgressBarName', detailKey: 'basicProgressBarDetail', group: 'template' },
    { kind: 'scrollView', name: '滚动视图', detail: 'Scene 模板', nameKey: 'basicScrollViewName', detailKey: 'basicScrollViewDetail', group: 'template' },
];

export const basicNodeLibrary = basicComponentLibrary.filter((item) => item.group === 'node');
export const sceneTemplateLibrary = basicComponentLibrary.filter((item) => item.group === 'template');

function nodeKeyBase(kind: BasicComponentKind) {
    switch (kind) {
        case 'button':
            return 'button';
        case 'progressBar':
            return 'progressBar';
        case 'scrollView':
            return 'scrollView';
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

function nextNodeKey(document: SceneDocument, kind: BasicComponentKind) {
    const keys = collectNodeKeys(document.scene.root);
    const base = nodeKeyBase(kind);
    let index = 1;
    let key = `${base}${index}`;

    while (keys.has(key) || (kind === 'button' && keys.has(`${key}Label`))) {
        index += 1;
        key = `${base}${index}`;
    }

    return { key, index };
}

export function createBasicComponentNode(document: SceneDocument, kind: BasicComponentKind): NodeSpec {
    const { key, index } = nextNodeKey(document, kind);

    switch (kind) {
        case 'button':
            return buttonScene(`按钮${index}`, {
                key,
                width: 120,
                height: 36,
                label: '按钮',
                color: 0x2563eb,
                radius: 6,
            });
        case 'progressBar':
            return progressBarScene(`进度条${index}`, {
                key,
                width: 180,
                height: 18,
                value: 0.5,
            });
        case 'scrollView':
            return scrollViewScene(`滚动视图${index}`, {
                key,
                width: 220,
                height: 160,
                contentHeight: 320,
            });
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

export function isBasicComponentKind(value: string): value is BasicComponentKind {
    return basicComponentLibrary.some((item) => item.kind === value);
}
