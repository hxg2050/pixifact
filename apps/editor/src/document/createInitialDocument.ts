import {
    EditorDocument,
    button,
    group,
    prefab,
    ref,
    roundedRect,
    textGraphic,
} from '../../../../src';
import type { PrefabSpec } from '../../../../src';

export function createInitialPrefab(): PrefabSpec {
    return prefab('默认按钮',
        group('画布', {
            id: 'root',
            key: 'root',
            width: 960,
            height: 540,
            children: [
                group('按钮', {
                    id: 'submit-button-node',
                    key: 'submitButton',
                    x: 64,
                    y: 64,
                    width: 160,
                    height: 48,
                    components: [
                        roundedRect({
                            color: 0x2563eb,
                            radius: 8,
                            strokeColor: 0x1d4ed8,
                            strokeWidth: 1,
                        }, 'bg'),
                        button({
                            targetGraphic: ref('bg'),
                            onClick: 'submitLogin',
                        }, 'button'),
                    ],
                    children: [
                        group('标签', {
                            id: 'submit-button-label-node',
                            key: 'submitButtonLabel',
                            width: 160,
                            height: 48,
                            components: [
                                textGraphic({
                                    text: '提交',
                                    color: 0xffffff,
                                    fontSize: 14,
                                    fontWeight: '700',
                                    center: true,
                                }, 'text'),
                            ],
                        }),
                    ],
                }),
            ],
        }),
    );
}

export function createInitialDocument() {
    const document = new EditorDocument(createInitialPrefab());

    document.addAction({
        key: 'submitLogin',
        label: '提交登录',
        description: '主按钮动作。',
    });
    document.addAction({
        key: 'useInventoryItem',
        label: '使用背包物品',
        description: '使用当前选中的背包物品。',
    });
    document.setSelection({ type: 'node', node: 'submitButton' });
    document.dirty = false;

    return document;
}
