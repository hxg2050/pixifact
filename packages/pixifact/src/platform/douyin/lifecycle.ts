import { bindMiniGameLifecycle, type MiniGameLifecycleBinding } from '../minigame/lifecycle';
import { douyinApi } from './types';

export type DouyinLifecycleBinding = MiniGameLifecycleBinding;

export function bindDouyinLifecycle(
    target: Parameters<typeof bindMiniGameLifecycle>[1],
    options: { onHide?(): void; onShow?(): void } = {},
): DouyinLifecycleBinding {
    return bindMiniGameLifecycle(douyinApi(), target, options);
}
