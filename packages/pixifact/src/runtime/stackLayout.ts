import type { Container, ContainerChild } from 'pixi.js';

export type StackAlign = 'start' | 'center' | 'end';
export type StackJustify = 'start' | 'center' | 'end' | 'space-between';
export type StackAxis = 'horizontal' | 'vertical';

export interface StackSize {
    width: number;
    height: number;
}

export function finiteNumber(value: number, fallback: number) {
    return Number.isFinite(value) ? value : fallback;
}

export function parseStackAlign(value: string): StackAlign {
    if (value === 'center' || value === 'end') {
        return value;
    }
    return 'start';
}

export function parseStackJustify(value: string): StackJustify {
    if (value === 'center' || value === 'end' || value === 'space-between') {
        return value;
    }
    return 'start';
}

export function stackAlignOffset(align: StackAlign, available: number) {
    if (align === 'center') {
        return available / 2;
    }
    if (align === 'end') {
        return available;
    }
    return 0;
}

export function stackJustifyOffset(justify: StackJustify, available: number) {
    if (justify === 'center') {
        return available / 2;
    }
    if (justify === 'end') {
        return available;
    }
    return 0;
}

export function stackChildSize(child: ContainerChild): StackSize {
    return {
        width: child.width,
        height: child.height,
    };
}

export function measureStackNaturalSize(axis: StackAxis, children: readonly ContainerChild[], gap: number): StackSize {
    if (children.length === 0) {
        return { width: 0, height: 0 };
    }
    const gapTotal = gap * Math.max(0, children.length - 1);
    const sizes = children.map(stackChildSize);
    if (axis === 'horizontal') {
        return {
            width: sizes.reduce((sum, size) => sum + size.width, 0) + gapTotal,
            height: sizes.reduce((max, size) => Math.max(max, size.height), 0),
        };
    }
    return {
        width: sizes.reduce((max, size) => Math.max(max, size.width), 0),
        height: sizes.reduce((sum, size) => sum + size.height, 0) + gapTotal,
    };
}

export function layoutChild(child: ContainerChild) {
    (child as Container & { layout?: () => void }).layout?.();
}
