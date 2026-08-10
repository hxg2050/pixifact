import { createMiniGameRuntime, MiniGamePointerEvent, type MiniGameRuntime } from '../minigame/runtime';
import { douyinApi } from './types';

export type DouyinRuntime = MiniGameRuntime;
export { MiniGamePointerEvent as DouyinPointerEvent };

export function createDouyinRuntime(): DouyinRuntime {
    return createMiniGameRuntime(douyinApi(), 'DouyinMiniGame');
}
