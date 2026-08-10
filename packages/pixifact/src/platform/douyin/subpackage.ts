import { createMiniGameSubpackageLoader } from '../minigame/subpackage';
import { douyinApi } from './types';

const load = createMiniGameSubpackageLoader(douyinApi, 'Douyin');

export function loadDouyinSubpackage(name: string): Promise<void> {
    return load(name);
}
