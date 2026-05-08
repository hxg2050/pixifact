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
