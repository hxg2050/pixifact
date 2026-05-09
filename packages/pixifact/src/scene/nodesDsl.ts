import { component, container, shape, text } from "./dsl";
import type { ComponentSpec, ContainerNodeSpec } from "./spec";

export function buttonScene(
    name: string,
    options: {
        id?: string;
        key?: string;
        role?: string;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        label?: string;
        color?: number;
        textColor?: number;
        radius?: number;
        onClick?: string;
    } = {},
): ContainerNodeSpec {
    const key = options.key ?? options.id ?? 'button';
    const width = options.width ?? 120;
    const height = options.height ?? 36;
    const background = `${key}Bg`;
    const components: ComponentSpec[] = [
        component('ui.Button', {
            targetGraphic: background,
            ...(options.onClick ? { onClick: options.onClick } : {}),
        }, `${key}Button`),
    ];

    return container(name, {
        id: options.id,
        key,
        role: options.role ?? 'button',
        x: options.x,
        y: options.y,
        width,
        height,
        components,
        children: [
            shape('背景', {
                id: background,
                key: background,
                width,
                height,
                type: 'roundedRect',
                color: options.color ?? 0x2563eb,
                radius: options.radius ?? 6,
            }),
            text('文字', {
                id: `${key}Label`,
                key: `${key}Label`,
                width,
                height,
                value: options.label ?? '按钮',
                color: options.textColor ?? 0xffffff,
                fontSize: 14,
                center: true,
            }),
        ],
    });
}

export function progressBarScene(
    name: string,
    options: {
        id?: string;
        key?: string;
        role?: string;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        value?: number;
        min?: number;
        max?: number;
        backgroundColor?: number;
        fillColor?: number;
        radius?: number;
    } = {},
): ContainerNodeSpec {
    const key = options.key ?? options.id ?? 'progressBar';
    const width = options.width ?? 180;
    const height = options.height ?? 18;
    const min = options.min ?? 0;
    const max = options.max ?? 1;
    const value = options.value ?? 0.5;
    const range = max - min;
    const normalized = range === 0 ? 0 : Math.min(1, Math.max(0, (value - min) / range));
    const fillNode = `${key}Fill`;

    return container(name, {
        id: options.id,
        key,
        role: options.role ?? 'progress-bar',
        x: options.x,
        y: options.y,
        width,
        height,
        components: [
            component('ui.ProgressBar', {
                value,
                min,
                max,
                fillNode,
            }, `${key}Progress`),
        ],
        children: [
            shape('背景', {
                id: `${key}Bg`,
                key: `${key}Bg`,
                width,
                height,
                type: 'roundedRect',
                color: options.backgroundColor ?? 0xe2e8f0,
                radius: options.radius ?? 9,
            }),
            shape('填充', {
                id: fillNode,
                key: fillNode,
                width: width * normalized,
                height,
                type: 'roundedRect',
                color: options.fillColor ?? 0x22c55e,
                radius: options.radius ?? 9,
            }),
        ],
    });
}

export function scrollViewScene(
    name: string,
    options: {
        id?: string;
        key?: string;
        role?: string;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        contentHeight?: number;
        wheelSensitivity?: number;
        dragEnabled?: boolean;
    } = {},
): ContainerNodeSpec {
    const key = options.key ?? options.id ?? 'scrollView';
    const width = options.width ?? 220;
    const height = options.height ?? 160;
    const contentHeight = options.contentHeight ?? 320;
    const viewport = `${key}Viewport`;
    const content = `${key}Content`;

    return container(name, {
        id: options.id,
        key,
        role: options.role ?? 'scroll-view',
        x: options.x,
        y: options.y,
        width,
        height,
        components: [
            component('ui.ScrollRect', {
                viewport,
                content,
                contentHeight,
                wheelSensitivity: options.wheelSensitivity ?? 1,
                dragEnabled: options.dragEnabled ?? true,
            }, `${key}Scroll`),
        ],
        children: [
            shape('背景', {
                id: `${key}Bg`,
                key: `${key}Bg`,
                width,
                height,
                type: 'roundedRect',
                color: 0xf8fafc,
                radius: 8,
                strokeColor: 0xcbd5e1,
                strokeWidth: 1,
            }),
            container('视口', {
                id: viewport,
                key: viewport,
                role: 'scroll-viewport',
                width,
                height,
                children: [
                    container('内容', {
                        id: content,
                        key: content,
                        role: 'scroll-content',
                        width,
                        height: contentHeight,
                        children: [
                            shape('内容背景', {
                                id: `${key}ContentBg`,
                                key: `${key}ContentBg`,
                                width,
                                height: contentHeight,
                                type: 'roundedRect',
                                color: 0xffffff,
                                radius: 8,
                            }),
                            text('内容提示', {
                                id: `${key}Hint`,
                                key: `${key}Hint`,
                                x: 16,
                                y: 16,
                                width: width - 32,
                                height: 24,
                                value: '滚动内容',
                                color: 0x334155,
                                fontSize: 14,
                            }),
                        ],
                    }),
                ],
            }),
        ],
    });
}
