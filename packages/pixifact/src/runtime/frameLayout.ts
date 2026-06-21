import type { Container, ContainerChild } from 'pixi.js';

export const frameLayoutProps = [
    'left',
    'right',
    'top',
    'bottom',
    'horizontal',
    'vertical',
] as const;

export type FrameLayoutProp = typeof frameLayoutProps[number];

export type FrameLayout = Partial<Record<FrameLayoutProp, number>>;

const frameLayouts = new WeakMap<object, FrameLayout>();

export function getFrameLayout(target: object): FrameLayout {
    return frameLayouts.get(target) ?? {};
}

export function setFrameLayout(target: Container, layout: FrameLayout) {
    const next = { ...getFrameLayout(target) };
    for (const key of frameLayoutProps) {
        if (!(key in layout)) {
            continue;
        }
        const value = layout[key];
        if (value === undefined) {
            delete next[key];
        } else {
            next[key] = value;
        }
    }

    if (Object.keys(next).length === 0) {
        frameLayouts.delete(target);
    } else {
        frameLayouts.set(target, next);
    }

    requestFrameLayout(target.parent);
}

export function layoutFrameChildren(parent: Container & { width: number; height: number }) {
    for (const child of parent.children) {
        layoutFrameChild(parent, child);
    }
}

export function requestFrameLayout(target: Container | null | undefined) {
    let current = target as (Container & { layout?: () => void }) | null | undefined;
    while (current) {
        if (typeof current.layout === 'function') {
            current.layout();
            return;
        }
        current = current.parent as (Container & { layout?: () => void }) | null | undefined;
    }
}

function layoutFrameChild(parent: Container & { width: number; height: number }, child: ContainerChild) {
    const layout = frameLayouts.get(child);
    if (!layout) {
        return;
    }

    const horizontal = resolveAxis({
        start: layout.left,
        end: layout.right,
        center: layout.horizontal,
        parentSize: parent.width,
        childSize: child.width,
    });
    const vertical = resolveAxis({
        start: layout.top,
        end: layout.bottom,
        center: layout.vertical,
        parentSize: parent.height,
        childSize: child.height,
    });

    if (horizontal.position !== undefined || vertical.position !== undefined) {
        child.position.set(horizontal.position ?? child.x, vertical.position ?? child.y);
    }
    if (horizontal.size !== undefined || vertical.size !== undefined) {
        setChildSize(child, horizontal.size ?? child.width, vertical.size ?? child.height);
    }

    const childLayout = child as ContainerChild & { layout?: () => void };
    childLayout.layout?.();
}

function setChildSize(child: ContainerChild, width: number, height: number) {
    const sizedChild = child as ContainerChild & {
        setSize?: (width: number, height?: number) => void;
    };
    if (sizedChild.setSize) {
        sizedChild.setSize(width, height);
        return;
    }
    child.width = width;
    child.height = height;
}

function resolveAxis(options: {
    start: number | undefined;
    end: number | undefined;
    center: number | undefined;
    parentSize: number;
    childSize: number;
}) {
    if (options.start !== undefined && options.end !== undefined) {
        return {
            position: options.start,
            size: Math.max(0, options.parentSize - options.start - options.end),
        };
    }
    if (options.start !== undefined) {
        return {
            position: options.start,
            size: undefined,
        };
    }
    if (options.end !== undefined) {
        return {
            position: options.parentSize - options.end - options.childSize,
            size: undefined,
        };
    }
    if (options.center !== undefined) {
        return {
            position: (options.parentSize - options.childSize) / 2 + options.center,
            size: undefined,
        };
    }
    return {
        position: undefined,
        size: undefined,
    };
}
