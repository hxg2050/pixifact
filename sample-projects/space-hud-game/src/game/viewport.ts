export const DESIGN_WIDTH = 720;
export const DESIGN_HEIGHT = 1280;

export interface ViewportLayout {
    designWidth: number;
    designHeight: number;
    screenWidth: number;
    screenHeight: number;
    worldWidth: number;
    worldHeight: number;
    designOffsetX: number;
    designOffsetY: number;
    scale: number;
}

export interface DesignBounds {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

export function computeViewportLayout(screenWidth: number, screenHeight: number): ViewportLayout {
    const scale = Math.min(screenWidth / DESIGN_WIDTH, screenHeight / DESIGN_HEIGHT);
    const worldWidth = screenWidth / scale;
    const worldHeight = screenHeight / scale;
    return {
        designWidth: DESIGN_WIDTH,
        designHeight: DESIGN_HEIGHT,
        screenWidth,
        screenHeight,
        worldWidth,
        worldHeight,
        designOffsetX: (worldWidth - DESIGN_WIDTH) / 2,
        designOffsetY: (worldHeight - DESIGN_HEIGHT) / 2,
        scale,
    };
}

export function computeDesignBounds(): DesignBounds {
    return {
        left: 46,
        right: DESIGN_WIDTH - 46,
        top: 320,
        bottom: DESIGN_HEIGHT - 184,
    };
}

export function screenToDesignPoint(layout: ViewportLayout, screenX: number, screenY: number) {
    return {
        x: screenX / layout.scale - layout.designOffsetX,
        y: screenY / layout.scale - layout.designOffsetY,
    };
}
