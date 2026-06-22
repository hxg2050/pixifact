export const pixifactViewportModes = [
    'showAll',
    'cover',
    'fixedWidth',
    'fixedHeight',
] as const;

export type PixifactViewportMode = typeof pixifactViewportModes[number];

export interface PixifactViewportConfig {
    mode: PixifactViewportMode;
}

export interface PixifactViewportSize {
    width: number;
    height: number;
}

export interface PixifactViewportPoint {
    x: number;
    y: number;
}

export interface PixifactViewportRect extends PixifactViewportPoint, PixifactViewportSize {}

export interface PixifactViewportLayout {
    mode: PixifactViewportMode;
    resolution: PixifactViewportSize;
    screen: PixifactViewportSize;
    scene: PixifactViewportSize;
    visibleRect: PixifactViewportRect;
    scale: number;
    offset: PixifactViewportPoint;
}

export interface PixifactViewportLayoutTarget {
    root: {
        setSize(width: number, height: number): void;
    };
    stage: {
        position: {
            set(x: number, y: number): void;
        };
        scale: {
            set(x: number, y?: number): void;
        };
    };
}

export function calculatePixifactViewportLayout(options: {
    mode: PixifactViewportMode;
    resolution: PixifactViewportSize;
    screen: PixifactViewportSize;
}): PixifactViewportLayout {
    const { mode, resolution, screen } = options;
    if (mode === 'showAll') {
        const scale = Math.min(screen.width / resolution.width, screen.height / resolution.height);
        return {
            mode,
            resolution,
            screen,
            scene: { ...resolution },
            visibleRect: { x: 0, y: 0, ...resolution },
            scale,
            offset: centeredOffset(resolution, screen, scale),
        };
    }

    if (mode === 'cover') {
        const scale = Math.max(screen.width / resolution.width, screen.height / resolution.height);
        const visibleRect = centeredVisibleRect(resolution, screen, scale);
        return {
            mode,
            resolution,
            screen,
            scene: { ...resolution },
            visibleRect,
            scale,
            offset: {
                x: cleanZero(-visibleRect.x * scale),
                y: cleanZero(-visibleRect.y * scale),
            },
        };
    }

    if (mode === 'fixedWidth') {
        const scale = screen.width / resolution.width;
        const scene = {
            width: resolution.width,
            height: screen.height / scale,
        };
        return fixedViewportLayout(mode, resolution, screen, scene, scale);
    }

    const scale = screen.height / resolution.height;
    const scene = {
        width: screen.width / scale,
        height: resolution.height,
    };
    return fixedViewportLayout(mode, resolution, screen, scene, scale);
}

export function applyPixifactViewportLayout(target: PixifactViewportLayoutTarget, layout: PixifactViewportLayout) {
    target.root.setSize(layout.scene.width, layout.scene.height);
    target.stage.position.set(layout.offset.x, layout.offset.y);
    target.stage.scale.set(layout.scale, layout.scale);
}

function fixedViewportLayout(
    mode: PixifactViewportMode,
    resolution: PixifactViewportSize,
    screen: PixifactViewportSize,
    scene: PixifactViewportSize,
    scale: number,
): PixifactViewportLayout {
    return {
        mode,
        resolution,
        screen,
        scene,
        visibleRect: {
            x: 0,
            y: 0,
            ...scene,
        },
        scale,
        offset: {
            x: 0,
            y: 0,
        },
    };
}

function centeredOffset(scene: PixifactViewportSize, screen: PixifactViewportSize, scale: number): PixifactViewportPoint {
    return {
        x: cleanZero((screen.width - scene.width * scale) / 2),
        y: cleanZero((screen.height - scene.height * scale) / 2),
    };
}

function centeredVisibleRect(
    resolution: PixifactViewportSize,
    screen: PixifactViewportSize,
    scale: number,
): PixifactViewportRect {
    const width = screen.width / scale;
    const height = screen.height / scale;
    return {
        x: cleanZero((resolution.width - width) / 2),
        y: cleanZero((resolution.height - height) / 2),
        width,
        height,
    };
}

function cleanZero(value: number) {
    return Object.is(value, -0) ? 0 : value;
}
