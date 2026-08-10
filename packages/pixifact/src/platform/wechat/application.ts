import { createMiniGamePixiApplication, type MiniGamePixiApplication, type MiniGamePixiApplicationOptions } from '../minigame/application';
import type { MiniGameTouch } from '../minigame/types';
import { fetchWechatResource } from './fetch';
import { wechatApi, type WechatCanvas } from './types';

export type WechatPixiApplicationOptions = MiniGamePixiApplicationOptions;
export type WechatPixiApplication = MiniGamePixiApplication & { readonly canvas: WechatCanvas };

function wechatTouchCoordinates(touch: MiniGameTouch) {
    return {
        x: touch.clientX ?? touch.x ?? touch.pageX ?? touch.screenX ?? 0,
        y: touch.clientY ?? touch.y ?? touch.pageY ?? touch.screenY ?? 0,
    };
}

export async function createWechatPixiApplication(
    options: WechatPixiApplicationOptions = {},
): Promise<WechatPixiApplication> {
    return createMiniGamePixiApplication(
        wechatApi(),
        'WeChatMiniGame',
        fetchWechatResource,
        wechatTouchCoordinates,
        options,
    ) as Promise<WechatPixiApplication>;
}
