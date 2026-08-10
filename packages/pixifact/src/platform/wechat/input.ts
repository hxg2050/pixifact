import { bindMiniGamePointerEvents, type MiniGamePointerBinding, type MiniGamePointerEventSink } from '../minigame/input';
import type { WechatCanvas, WechatTouch } from './types';
import { wechatApi } from './types';

export type WechatPointerEventSink = MiniGamePointerEventSink;
export type WechatPointerBinding = MiniGamePointerBinding;

function wechatTouchCoordinates(touch: WechatTouch) {
    return {
        x: touch.clientX ?? touch.x ?? touch.pageX ?? touch.screenX ?? 0,
        y: touch.clientY ?? touch.y ?? touch.pageY ?? touch.screenY ?? 0,
    };
}

export function bindWechatPointerEvents(
    canvas: WechatCanvas,
    sink: WechatPointerEventSink,
): WechatPointerBinding {
    return bindMiniGamePointerEvents(wechatApi(), canvas, sink, wechatTouchCoordinates);
}
