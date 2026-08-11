import { createMiniGameSubpackageLoader } from 'pixifact/internal/minigame';
import { wechatApi } from './types';

export const loadWechatSubpackage = createMiniGameSubpackageLoader(wechatApi, 'WeChat');
