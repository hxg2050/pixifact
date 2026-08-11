import type {
    MiniGameApi,
    MiniGameCanvas,
    MiniGameImage,
    MiniGameTouch,
    MiniGameTouchEvent,
} from 'pixifact/internal/minigame';

export type DouyinCanvas = MiniGameCanvas;
export type DouyinImage = MiniGameImage;
export type DouyinTouch = MiniGameTouch;
export type DouyinTouchEvent = MiniGameTouchEvent;
export type DouyinMiniGameApi = MiniGameApi;

export function douyinApi() {
    return (globalThis as typeof globalThis & { tt: DouyinMiniGameApi }).tt;
}
