import { fetchMiniGameResource } from '../minigame/fetch';
import { wechatApi } from './types';

export function fetchWechatResource(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    return fetchMiniGameResource(wechatApi(), input, init, 'WeChat');
}
