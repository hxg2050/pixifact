import { Container, type ContainerChild } from 'pixi.js';

export type ControlSizeMode = 'content' | 'fill' | 'expand';
export type ControlAlign = 'start' | 'center' | 'end';
export type ControlJustify = 'start' | 'center' | 'end' | 'space-between';
export type ControlAxis = 'horizontal' | 'vertical';

export interface Size {
    width: number;
    height: number;
}

export interface Rect extends Size {
    x: number;
    y: number;
}

export interface ControlLayoutProps {
    minWidth: number;
    minHeight: number;
    hSize: ControlSizeMode;
    vSize: ControlSizeMode;
    stretch: number;
}

export type ControlLayoutChild = ContainerChild & {
    getControlLayoutProps?: () => ControlLayoutProps;
    measureControlNaturalSize?: () => Size;
    setControlLayoutBox?: (x: number, y: number, width: number, height: number) => void;
};

export const defaultControlLayoutProps: ControlLayoutProps = {
    minWidth: 0,
    minHeight: 0,
    hSize: 'content',
    vSize: 'content',
    stretch: 1,
};

export function measureChildren(container: Container): Size {
    const bounds = measureChildrenBounds(container);
    return {
        width: bounds.width,
        height: bounds.height,
    };
}

export function measureChildrenBounds(container: Container): Rect {
    if (container.children.length === 0) {
        return { x: 0, y: 0, width: 0, height: 0 };
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const child of container.children) {
        minX = Math.min(minX, child.x);
        minY = Math.min(minY, child.y);
        maxX = Math.max(maxX, child.x + child.width);
        maxY = Math.max(maxY, child.y + child.height);
    }

    return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
    };
}

export function measureControlChild(child: ControlLayoutChild, baseSizes: WeakMap<object, Size>): Size {
    const measured = child.measureControlNaturalSize?.();
    if (measured) {
        return measured;
    }
    if (!baseSizes.has(child)) {
        baseSizes.set(child, {
            width: child.width,
            height: child.height,
        });
    }
    return baseSizes.get(child) ?? { width: child.width, height: child.height };
}

export function controlChildProps(child: ControlLayoutChild): ControlLayoutProps {
    return child.getControlLayoutProps?.() ?? defaultControlLayoutProps;
}

export function controlMinSize(child: ControlLayoutChild, baseSizes: WeakMap<object, Size>): Size {
    const props = controlChildProps(child);
    const natural = measureControlChild(child, baseSizes);
    return {
        width: Math.max(natural.width, props.minWidth),
        height: Math.max(natural.height, props.minHeight),
    };
}

export function setControlChildBox(child: ControlLayoutChild, rect: Rect) {
    if (child.setControlLayoutBox) {
        child.setControlLayoutBox(rect.x, rect.y, rect.width, rect.height);
        return;
    }
    child.position.set(rect.x, rect.y);
}

export interface StackLayoutOptions {
    axis: ControlAxis;
    children: ControlLayoutChild[] | undefined;
    gap: number;
    alignCross: ControlAlign;
    justify: ControlJustify;
    baseSizes: WeakMap<object, Size>;
    width: number | undefined;
    height: number | undefined;
    naturalSize: () => Size;
}

export function layoutStack(options: StackLayoutOptions) {
    const children = options.children;
    if (!children || children.length === 0) {
        return;
    }

    const mainAxis = options.axis;
    const cross = crossAxis(mainAxis);
    const naturalContainer = options.naturalSize();
    const containerWidth = options.width ?? naturalContainer.width;
    const containerHeight = options.height ?? naturalContainer.height;
    const containerMain = mainAxis === 'horizontal' ? containerWidth : containerHeight;
    const containerCross = cross === 'horizontal' ? containerWidth : containerHeight;
    const gapTotal = options.gap * Math.max(0, children.length - 1);
    const items = children.map((child) => {
        const props = controlChildProps(child);
        const natural = controlMinSize(child, options.baseSizes);
        const mainMode = mainAxis === 'horizontal' ? props.hSize : props.vSize;
        const crossMode = cross === 'horizontal' ? props.hSize : props.vSize;
        return {
            child,
            props,
            mainMode,
            crossMode,
            baseMain: mainAxis === 'horizontal' ? natural.width : natural.height,
            baseCross: cross === 'horizontal' ? natural.width : natural.height,
            mainSize: mainAxis === 'horizontal' ? natural.width : natural.height,
            crossSize: cross === 'horizontal' ? natural.width : natural.height,
        };
    });
    const naturalMain = items.reduce((sum, item) => sum + item.baseMain, 0);
    const freeMain = Math.max(0, containerMain - naturalMain - gapTotal);
    const expandable = items.filter((item) => item.mainMode === 'expand');
    const totalStretch = expandable.reduce((sum, item) => sum + item.props.stretch, 0);

    if (totalStretch > 0) {
        for (const item of expandable) {
            item.mainSize = item.baseMain + freeMain * (item.props.stretch / totalStretch);
        }
    }

    for (const item of items) {
        if (fillOrExpand(item.crossMode)) {
            item.crossSize = containerCross;
        }
    }

    const usedMain = items.reduce((sum, item) => sum + item.mainSize, 0) + gapTotal;
    const remainingMain = Math.max(0, containerMain - usedMain);
    const actualGap = options.justify === 'space-between' && items.length > 1
        ? options.gap + remainingMain / (items.length - 1)
        : options.gap;
    let cursor = justifyOffset(options.justify, remainingMain);

    for (const item of items) {
        const crossFree = Math.max(0, containerCross - item.crossSize);
        const main = cursor;
        const crossPosition = alignOffset(options.alignCross, crossFree);
        setControlChildBox(item.child, {
            x: mainAxis === 'horizontal' ? main : crossPosition,
            y: mainAxis === 'horizontal' ? crossPosition : main,
            width: mainAxis === 'horizontal' ? item.mainSize : item.crossSize,
            height: mainAxis === 'horizontal' ? item.crossSize : item.mainSize,
        });
        cursor += item.mainSize + actualGap;
    }
}

export function measureStackNaturalSize(axis: ControlAxis, children: ControlLayoutChild[] | undefined, gap: number, baseSizes: WeakMap<object, Size>): Size {
    if (!children || children.length === 0) {
        return { width: 0, height: 0 };
    }
    const gapTotal = gap * Math.max(0, children.length - 1);
    const sizes = children.map((child) => controlMinSize(child, baseSizes));
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

export function fillOrExpand(mode: ControlSizeMode) {
    return mode === 'fill' || mode === 'expand';
}

export function crossAxis(axis: ControlAxis): ControlAxis {
    return axis === 'horizontal' ? 'vertical' : 'horizontal';
}

export function alignOffset(align: ControlAlign, available: number) {
    if (align === 'center') {
        return available / 2;
    }
    if (align === 'end') {
        return available;
    }
    return 0;
}

export function justifyOffset(justify: ControlJustify, available: number) {
    if (justify === 'center') {
        return available / 2;
    }
    if (justify === 'end') {
        return available;
    }
    return 0;
}

export function parseSizeMode(value: string): ControlSizeMode {
    if (value === 'fill' || value === 'expand') {
        return value;
    }
    return 'content';
}

export function parseAlign(value: string): ControlAlign {
    if (value === 'center' || value === 'end') {
        return value;
    }
    return 'start';
}

export function parseJustify(value: string): ControlJustify {
    if (value === 'center' || value === 'end' || value === 'space-between') {
        return value;
    }
    return 'start';
}

export function finiteNumber(value: number, fallback: number) {
    return Number.isFinite(value) ? value : fallback;
}
