import { createMiniGameRuntime, MiniGamePointerEvent, type MiniGameRuntime } from '../minigame/runtime';
import { wechatApi } from './types';

export type WechatRuntime = MiniGameRuntime;
export { MiniGamePointerEvent as WechatPointerEvent };

export function createWechatRuntime(): WechatRuntime {
    return createMiniGameRuntime(wechatApi(), 'WeChatMiniGame');
}
