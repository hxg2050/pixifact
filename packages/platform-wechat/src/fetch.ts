import { fetchMiniGameResource, miniGameResourceSubpackage } from 'pixifact/internal/minigame';
import { loadWechatSubpackage } from './subpackage';
import { wechatApi } from './types';

export async function fetchWechatResource(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const subpackage = miniGameResourceSubpackage(input);
    if (subpackage) await loadWechatSubpackage(subpackage);
    return fetchMiniGameResource(wechatApi(), input, init, 'WeChat');
}
