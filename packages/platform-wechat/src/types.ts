import type {
    MiniGameApi,
    MiniGameCanvas,
    MiniGameImage,
    MiniGameTouch,
    MiniGameTouchEvent,
} from 'pixifact/internal/minigame';

export type WechatCanvas = MiniGameCanvas;
export type WechatImage = MiniGameImage;
export type WechatTouch = MiniGameTouch;
export type WechatTouchEvent = MiniGameTouchEvent;
export type WechatMiniGameApi = MiniGameApi;

export function wechatApi() {
    return (globalThis as typeof globalThis & { wx: WechatMiniGameApi }).wx;
}
