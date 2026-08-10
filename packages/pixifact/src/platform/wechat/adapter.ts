import { createMiniGamePixiAdapter } from '../minigame/adapter';
import type { WechatRuntime } from './runtime';
import { fetchWechatResource } from './fetch';
import { wechatApi } from './types';

export function createWechatPixiAdapter(runtime: WechatRuntime) {
    return createMiniGamePixiAdapter(wechatApi(), runtime, fetchWechatResource);
}
