import type { SceneCommand } from "../commands";
import type { NodeSpec } from "./spec";
import { buttonScene, progressBarScene, scrollViewScene } from "./nodesDsl";
import { container, input, shape, text } from "./dsl";

export interface InventoryTemplateOptions {
    parent?: string;
    keyPrefix?: string;
    columns?: number;
    rows?: number;
    x?: number;
    y?: number;
}

function inventorySlot(keyPrefix: string, index: number, x: number, y: number): NodeSpec {
    const slotKey = `${keyPrefix}Slot${index + 1}`;
    return container(`格子 ${index + 1}`, {
        id: slotKey,
        key: slotKey,
        role: 'inventory-slot',
        x,
        y,
        width: 104,
        height: 120,
        children: [
            shape('背景', {
                id: `${slotKey}Bg`,
                key: `${slotKey}Bg`,
                width: 104,
                height: 120,
                type: 'roundedRect',
                color: 0xffffff,
                radius: 8,
                strokeColor: 0xcbd5e1,
                strokeWidth: 1,
            }),
            shape('图标', {
                id: `${slotKey}Icon`,
                key: `${slotKey}Icon`,
                role: 'item-icon',
                x: 12,
                y: 10,
                width: 80,
                height: 64,
                type: 'roundedRect',
                color: 0xe2e8f0,
                radius: 6,
            }),
            text('数量', {
                id: `${slotKey}Quantity`,
                key: `${slotKey}Quantity`,
                role: 'item-quantity',
                x: 64,
                y: 56,
                width: 28,
                height: 20,
                value: 'x1',
                color: 0x334155,
                fontSize: 12,
                fontWeight: '700',
                center: true,
            }),
            buttonScene('使用按钮', {
                id: `${slotKey}UseButton`,
                key: `${slotKey}UseButton`,
                role: 'item-use-button',
                x: 12,
                y: 84,
                width: 80,
                height: 26,
                label: '使用',
                color: 0x2563eb,
                textColor: 0xffffff,
                radius: 6,
                onClick: 'useInventoryItem',
            }),
        ],
    });
}

export function inventoryPanelNode(options: InventoryTemplateOptions = {}): NodeSpec {
    const keyPrefix = options.keyPrefix ?? 'inventory';
    const columns = options.columns ?? 4;
    const rows = options.rows ?? 3;
    const children: NodeSpec[] = [
        shape('背景', {
            id: `${keyPrefix}PanelBg`,
            key: `${keyPrefix}PanelBg`,
            width: 512,
            height: 480,
            type: 'roundedRect',
            color: 0xf8fafc,
            radius: 12,
            strokeColor: 0x94a3b8,
            strokeWidth: 1,
            strokeAlpha: 0.6,
        }),
        text('标题', {
            id: `${keyPrefix}Title`,
            key: `${keyPrefix}Title`,
            role: 'panel-title',
            x: 24,
            y: 18,
            width: 360,
            height: 30,
            value: '背包',
            color: 0x172033,
            fontSize: 22,
            fontWeight: '800',
        }),
    ];

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < columns; col++) {
            children.push(inventorySlot(keyPrefix, row * columns + col, 24 + col * 116, 66 + row * 132));
        }
    }

    return container('背包面板', {
        id: `${keyPrefix}Panel`,
        key: `${keyPrefix}Panel`,
        role: 'inventory-panel',
        x: options.x ?? 80,
        y: options.y ?? 48,
        width: 512,
        height: 480,
        children,
    });
}

export function createInventoryPanelCommands(options: InventoryTemplateOptions = {}): SceneCommand[] {
    return [{
        op: 'createNode',
        parent: options.parent,
        node: inventoryPanelNode(options),
    }];
}

export type SceneTemplateKind = 'button' | 'progressBar' | 'scrollView' | 'loginForm';

export interface SceneTemplateAddOptions {
    kind: SceneTemplateKind | string;
    parent?: string;
    key: string;
    label?: string;
}

function loginFormNode(options: { key: string; label?: string }): NodeSpec {
    const key = options.key;
    return container('登录表单', {
        id: key,
        key,
        role: 'login-form',
        x: 40,
        y: 28,
        width: 280,
        height: 220,
        children: [
            shape('背景', {
                id: `${key}Card`,
                key: `${key}Card`,
                width: 280,
                height: 220,
                type: 'roundedRect',
                color: 0xffffff,
                radius: 10,
                strokeColor: 0xcbd5e1,
                strokeWidth: 1,
            }),
            text('标题', {
                id: `${key}Title`,
                key: `${key}Title`,
                x: 24,
                y: 20,
                width: 232,
                height: 32,
                value: options.label ?? '登录',
                color: 0x111827,
                fontSize: 24,
                fontWeight: '700',
            }),
            input('用户名', {
                id: `${key}Username`,
                key: `${key}Username`,
                x: 24,
                y: 72,
                width: 232,
                height: 36,
                value: '',
                backgroundColor: 0xffffff,
                borderColor: 0x94a3b8,
                borderSize: 1,
                fontSize: 16,
            }),
            input('密码', {
                id: `${key}Password`,
                key: `${key}Password`,
                x: 24,
                y: 120,
                width: 232,
                height: 36,
                value: '',
                backgroundColor: 0xffffff,
                borderColor: 0x94a3b8,
                borderSize: 1,
                fontSize: 16,
            }),
            buttonScene('提交按钮', {
                id: `${key}Submit`,
                key: `${key}Submit`,
                x: 24,
                y: 172,
                width: 232,
                height: 36,
                label: options.label ?? '登录',
                color: 0x2563eb,
                radius: 6,
            }),
        ],
    });
}

export function sceneTemplateNode(options: SceneTemplateAddOptions): NodeSpec {
    switch (options.kind) {
        case 'button':
            return buttonScene(options.label ?? '按钮', {
                id: options.key,
                key: options.key,
                width: 120,
                height: 36,
                label: options.label ?? '按钮',
                color: 0x2563eb,
                radius: 6,
            });
        case 'progressBar':
            return progressBarScene(options.label ?? '进度条', {
                id: options.key,
                key: options.key,
                width: 180,
                height: 18,
                value: 0.5,
            });
        case 'scrollView':
            return scrollViewScene(options.label ?? '滚动视图', {
                id: options.key,
                key: options.key,
                width: 220,
                height: 160,
                contentHeight: 320,
            });
        case 'loginForm':
            return loginFormNode({
                key: options.key,
                label: options.label,
            });
        default:
            throw new Error(`Unknown template kind "${options.kind}".`);
    }
}

export function createSceneTemplateCommands(options: SceneTemplateAddOptions): SceneCommand[] {
    return [{
        op: 'createNode',
        parent: options.parent,
        node: sceneTemplateNode(options),
    }];
}
