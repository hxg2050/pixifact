import { createMiniGamePixiApplication, type MiniGamePixiApplication, type MiniGamePixiApplicationOptions } from '../minigame/application';
import type { MiniGameTouch } from '../minigame/types';
import { douyinApi, type DouyinCanvas } from './types';
import { fetchDouyinResource } from './fetch';

export type DouyinPixiApplicationOptions = MiniGamePixiApplicationOptions;
export type DouyinPixiApplication = MiniGamePixiApplication & { readonly canvas: DouyinCanvas };

function douyinTouchCoordinates(touch: MiniGameTouch) {
    return {
        x: touch.screenX ?? touch.clientX ?? touch.x ?? touch.pageX ?? 0,
        y: touch.screenY ?? touch.clientY ?? touch.y ?? touch.pageY ?? 0,
    };
}

export async function createDouyinPixiApplication(
    options: DouyinPixiApplicationOptions = {},
): Promise<DouyinPixiApplication> {
    return createMiniGamePixiApplication(
        douyinApi(),
        'DouyinMiniGame',
        fetchDouyinResource,
        douyinTouchCoordinates,
        options,
    ) as Promise<DouyinPixiApplication>;
}
