import { createMiniGamePixiAdapter } from '../minigame/adapter';
import type { DouyinRuntime } from './runtime';
import { douyinApi } from './types';
import { fetchDouyinResource } from './fetch';

export function createDouyinPixiAdapter(runtime: DouyinRuntime) {
    return createMiniGamePixiAdapter(douyinApi(), runtime, fetchDouyinResource);
}
