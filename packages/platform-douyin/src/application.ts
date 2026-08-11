import type { Application, ApplicationOptions } from 'pixi.js';
import { createMiniGameApplication, type MiniGameTouch } from 'pixifact/internal/minigame';
import { fetchDouyinResource } from './fetch';
import { douyinApi } from './types';

function douyinTouchCoordinates(touch: MiniGameTouch) {
    return {
        x: touch.screenX ?? touch.clientX ?? touch.x ?? touch.pageX ?? 0,
        y: touch.screenY ?? touch.clientY ?? touch.y ?? touch.pageY ?? 0,
    };
}

export function createApplication(
    options: Partial<ApplicationOptions> = {},
): Promise<Application> {
    return createMiniGameApplication(
        douyinApi(),
        'DouyinMiniGame',
        fetchDouyinResource,
        douyinTouchCoordinates,
        options,
    );
}
