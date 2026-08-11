import type { Application, ApplicationOptions } from 'pixi.js';
import { createMiniGameApplication, type MiniGameTouch } from 'pixifact/internal/minigame';
import { fetchWechatResource } from './fetch';
import { wechatApi } from './types';

function wechatTouchCoordinates(touch: MiniGameTouch) {
    return {
        x: touch.clientX ?? touch.x ?? touch.pageX ?? touch.screenX ?? 0,
        y: touch.clientY ?? touch.y ?? touch.pageY ?? touch.screenY ?? 0,
    };
}

export function createApplication(
    options: Partial<ApplicationOptions> = {},
): Promise<Application> {
    return createMiniGameApplication(
        wechatApi(),
        'WeChatMiniGame',
        fetchWechatResource,
        wechatTouchCoordinates,
        options,
    );
}
