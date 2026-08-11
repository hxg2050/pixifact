import { createMiniGameSubpackageLoader } from 'pixifact/internal/minigame';
import { douyinApi } from './types';

export const loadDouyinSubpackage = createMiniGameSubpackageLoader(douyinApi, 'Douyin');
