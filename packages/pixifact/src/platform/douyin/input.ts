import { bindMiniGamePointerEvents, type MiniGamePointerBinding, type MiniGamePointerEventSink } from '../minigame/input';
import type { DouyinCanvas, DouyinTouch } from './types';
import { douyinApi } from './types';

export type DouyinPointerEventSink = MiniGamePointerEventSink;
export type DouyinPointerBinding = MiniGamePointerBinding;

function douyinTouchCoordinates(touch: DouyinTouch) {
    return {
        x: touch.screenX ?? touch.clientX ?? touch.x ?? touch.pageX ?? 0,
        y: touch.screenY ?? touch.clientY ?? touch.y ?? touch.pageY ?? 0,
    };
}

export function bindDouyinPointerEvents(
    canvas: DouyinCanvas,
    sink: DouyinPointerEventSink,
): DouyinPointerBinding {
    return bindMiniGamePointerEvents(douyinApi(), canvas, sink, douyinTouchCoordinates);
}
