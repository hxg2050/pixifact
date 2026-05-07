import type { EditorCommand } from "../commands";
import type { NodeSpec } from "./spec";
import { group, ref } from "./dsl";
import { button, roundedRect, textGraphic } from "./uiDsl";

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
    return group(`格子 ${index + 1}`, {
        id: slotKey,
        key: slotKey,
        role: 'inventory-slot',
        x,
        y,
        width: 104,
        height: 120,
        components: [
            roundedRect({
                color: 0xffffff,
                radius: 8,
                strokeColor: 0xcbd5e1,
                strokeWidth: 1,
            }, 'slotBg'),
        ],
        children: [
            group('图标', {
                id: `${slotKey}Icon`,
                key: `${slotKey}Icon`,
                role: 'item-icon',
                x: 12,
                y: 10,
                width: 80,
                height: 64,
                components: [
                    roundedRect({
                        color: 0xe2e8f0,
                        radius: 6,
                    }, 'iconBg'),
                ],
            }),
            group('数量', {
                id: `${slotKey}Quantity`,
                key: `${slotKey}Quantity`,
                role: 'item-quantity',
                x: 64,
                y: 56,
                width: 28,
                height: 20,
                components: [
                    textGraphic({
                        text: 'x1',
                        color: 0x334155,
                        fontSize: 12,
                        fontWeight: '700',
                        center: true,
                    }, 'text'),
                ],
            }),
            group('使用按钮', {
                id: `${slotKey}UseButton`,
                key: `${slotKey}UseButton`,
                role: 'item-use-button',
                x: 12,
                y: 84,
                width: 80,
                height: 26,
                components: [
                    roundedRect({
                        color: 0x2563eb,
                        radius: 6,
                    }, 'bg'),
                    button({ targetGraphic: ref('bg'), onClick: 'useInventoryItem' }, 'button'),
                ],
                children: [
                    group('使用标签', {
                        id: `${slotKey}UseLabel`,
                        key: `${slotKey}UseLabel`,
                        width: 80,
                        height: 26,
                        components: [
                            textGraphic({
                                text: '使用',
                                color: 0xffffff,
                                fontSize: 12,
                                fontWeight: '700',
                                center: true,
                            }, 'text'),
                        ],
                    }),
                ],
            }),
        ],
    });
}

export function inventoryPanelNode(options: InventoryTemplateOptions = {}): NodeSpec {
    const keyPrefix = options.keyPrefix ?? 'inventory';
    const columns = options.columns ?? 4;
    const rows = options.rows ?? 3;
    const children: NodeSpec[] = [
        group('标题', {
            id: `${keyPrefix}Title`,
            key: `${keyPrefix}Title`,
            role: 'panel-title',
            x: 24,
            y: 18,
            width: 360,
            height: 30,
            components: [
                textGraphic({
                    text: '背包',
                    color: 0x172033,
                    fontSize: 22,
                    fontWeight: '800',
                }, 'text'),
            ],
        }),
    ];

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < columns; col++) {
            children.push(inventorySlot(keyPrefix, row * columns + col, 24 + col * 116, 66 + row * 132));
        }
    }

    return group('背包面板', {
        id: `${keyPrefix}Panel`,
        key: `${keyPrefix}Panel`,
        role: 'inventory-panel',
        x: options.x ?? 80,
        y: options.y ?? 48,
        width: 512,
        height: 480,
        components: [
            roundedRect({
                color: 0xf8fafc,
                radius: 12,
                strokeColor: 0x94a3b8,
                strokeWidth: 1,
                strokeAlpha: 0.6,
            }, 'panelBg'),
        ],
        children,
    });
}

export function createInventoryPanelCommands(options: InventoryTemplateOptions = {}): EditorCommand[] {
    return [{
        op: 'createNode',
        parent: options.parent,
        node: inventoryPanelNode(options),
    }];
}
