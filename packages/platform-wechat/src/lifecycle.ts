import { bindMiniGameLifecycle, type MiniGameLifecycleBinding } from 'pixifact/internal/minigame';
import { wechatApi } from './types';

export type WechatLifecycleBinding = MiniGameLifecycleBinding;

export function bindWechatLifecycle(
    target: Parameters<typeof bindMiniGameLifecycle>[1],
    options: { onHide?(): void; onShow?(): void } = {},
): WechatLifecycleBinding {
    return bindMiniGameLifecycle(wechatApi(), target, options);
}
