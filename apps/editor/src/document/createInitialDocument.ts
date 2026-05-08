import {
    buttonScene,
    container,
    SceneDocument,
    scene,
} from 'pixifact';
import type { SceneSpec } from 'pixifact';

export function createInitialScene(): SceneSpec {
    return scene('默认按钮',
        container('画布', {
            id: 'root',
            key: 'root',
            width: 960,
            height: 540,
            children: [
                buttonScene('按钮', {
                    id: 'submit-button-node',
                    key: 'submitButton',
                    x: 64,
                    y: 64,
                    width: 160,
                    height: 48,
                    label: '提交',
                    color: 0x2563eb,
                    textColor: 0xffffff,
                    radius: 8,
                    onClick: 'submitLogin',
                }),
            ],
        }),
    );
}

export function createInitialDocument() {
    const document = new SceneDocument(createInitialScene());

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
