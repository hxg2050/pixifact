import { createMiniGameSubpackageLoader } from '../minigame/subpackage';
import { wechatApi } from './types';

const load = createMiniGameSubpackageLoader(wechatApi, 'WeChat');

export function loadWechatSubpackage(name: string): Promise<void> {
    return load(name);
}
