import { fetchMiniGameResource } from '../minigame/fetch';
import { douyinApi } from './types';

export function fetchDouyinResource(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    return fetchMiniGameResource(douyinApi(), input, init, 'Douyin');
}
