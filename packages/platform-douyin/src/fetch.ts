import { fetchMiniGameResource, miniGameResourceSubpackage } from 'pixifact/internal/minigame';
import { loadDouyinSubpackage } from './subpackage';
import { douyinApi } from './types';

export async function fetchDouyinResource(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const subpackage = miniGameResourceSubpackage(input);
    if (subpackage) await loadDouyinSubpackage(subpackage);
    return fetchMiniGameResource(douyinApi(), input, init, 'Douyin');
}
