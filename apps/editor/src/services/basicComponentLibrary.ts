import type { EditorDocument, NodeSpec } from '../../../../src';
import type { I18nKey } from '../i18n';
import { editorDragDataTypes } from './dragPayload';

export const basicComponentDragDataType = editorDragDataTypes.basicComponent;

export type BasicComponentKind = 'group' | 'button' | 'text' | 'image';

export interface BasicComponentItem {
    kind: BasicComponentKind;
    name: string;
    detail: string;
    nameKey: I18nKey;
    detailKey: I18nKey;
}

export const basicComponentLibrary: BasicComponentItem[] = [
    { kind: 'group', name: '节点', detail: '空 Group 容器', nameKey: 'basicGroupName', detailKey: 'basicGroupDetail' },
    { kind: 'button', name: '按钮', detail: '背景 + Button + 文字', nameKey: 'basicButtonName', detailKey: 'basicButtonDetail' },
    { kind: 'text', name: '文字', detail: 'TextGraphic 文本', nameKey: 'basicTextName', detailKey: 'basicTextDetail' },
    { kind: 'image', name: '图片', detail: 'ImageGraphic 图片', nameKey: 'basicImageName', detailKey: 'basicImageDetail' },
];

function nodeKeyBase(kind: BasicComponentKind) {
    switch (kind) {
        case 'button':
            return 'button';
        case 'text':
            return 'text';
        case 'image':
            return 'image';
        default:
            return 'node';
    }
}

function collectNodeKeys(node: NodeSpec, keys = new Set<string>()) {
    if (node.key) {
        keys.add(node.key);
    }
    if (node.id) {
        keys.add(node.id);
    }
    for (const child of node.children ?? []) {
        collectNodeKeys(child, keys);
    }
    return keys;
}

function nextNodeKey(document: EditorDocument, kind: BasicComponentKind) {
    const keys = collectNodeKeys(document.prefab.root);
    const base = nodeKeyBase(kind);
    let index = 1;
    let key = `${base}${index}`;

    while (keys.has(key) || (kind === 'button' && keys.has(`${key}Label`))) {
        index += 1;
        key = `${base}${index}`;
    }

    return { key, index };
}

export function createBasicComponentNode(document: EditorDocument, kind: BasicComponentKind): NodeSpec {
    const { key, index } = nextNodeKey(document, kind);

    switch (kind) {
        case 'button':
            return {
                type: 'Group',
                key,
                name: `按钮${index}`,
                transform: { width: 120, height: 36 },
                components: [
                    { id: `${key}Bg`, type: 'ui.RoundedRectGraphic', props: { color: 0x2563eb, radius: 6 } },
                    { id: `${key}Button`, type: 'ui.Button', props: { targetGraphic: `${key}Bg` } },
                ],
                children: [
                    {
                        type: 'Group',
                        key: `${key}Label`,
                        name: '文字',
                        transform: { width: 120, height: 36 },
                        components: [
                            {
                                id: `${key}LabelText`,
                                type: 'ui.TextGraphic',
                                props: { text: '按钮', color: 0xffffff, fontSize: 14, center: true },
                            },
                        ],
                    },
                ],
            };
        case 'text':
            return {
                type: 'Group',
                key,
                name: `文字${index}`,
                transform: { width: 120, height: 28 },
                components: [
                    { id: `${key}Text`, type: 'ui.TextGraphic', props: { text: '文字', color: 0x111827, fontSize: 16 } },
                ],
            };
        case 'image':
            return {
                type: 'Group',
                key,
                name: `图片${index}`,
                transform: { width: 96, height: 96 },
                components: [
                    { id: `${key}Image`, type: 'ui.ImageGraphic', props: { src: '', tint: 0xffffff } },
                ],
            };
        default:
            return {
                type: 'Group',
                key,
                name: `节点${index}`,
                transform: { width: 100, height: 100 },
                children: [],
            };
    }
}

export function isBasicComponentKind(value: string): value is BasicComponentKind {
    return basicComponentLibrary.some((item) => item.kind === value);
}
