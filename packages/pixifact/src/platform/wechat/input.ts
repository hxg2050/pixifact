import { WechatPointerEvent } from './runtime';
import { wechatApi, type WechatCanvas, type WechatTouch, type WechatTouchEvent } from './types';

interface PointerState {
    force: number;
    pointerId: number;
    x: number;
    y: number;
}

export interface WechatPointerEventSink {
    pointerdown(event: Event): void;
    pointermove(event: Event): void;
    pointerup(event: Event): void;
}

export interface WechatPointerBinding {
    readonly activePointerCount: number;
    cancelAll(): void;
    dispose(): void;
}

function pointerState(touch: WechatTouch): PointerState {
    return {
        force: touch.force ?? 0.5,
        pointerId: (touch.identifier ?? 0) + 1,
        x: touch.clientX ?? touch.x ?? touch.pageX ?? 0,
        y: touch.clientY ?? touch.y ?? touch.pageY ?? 0,
    };
}

function changedTouches(event: WechatTouchEvent) {
    return event.changedTouches?.length ? event.changedTouches : event.touches ?? [];
}

export function bindWechatPointerEvents(
    canvas: WechatCanvas,
    sink: WechatPointerEventSink,
): WechatPointerBinding {
    const wx = wechatApi();
    const activePointers = new Map<number, PointerState>();
    let disposed = false;
    let primaryPointerId: number | null = null;

    const dispatch = (
        type: 'pointerdown' | 'pointermove' | 'pointerup',
        state: PointerState,
        eventTarget: EventTarget,
        buttons: number,
    ) => {
        const event = new WechatPointerEvent(type, {
            button: 0,
            buttons,
            clientX: state.x,
            clientY: state.y,
            height: 1,
            isPrimary: state.pointerId === primaryPointerId,
            pointerId: state.pointerId,
            pointerType: 'touch',
            pressure: buttons ? state.force : 0,
            width: 1,
        });
        event.target = eventTarget;
        event.srcElement = canvas as unknown as EventTarget;
        event.isTrusted = true;
        sink[type](event as unknown as Event);
    };

    const handleStart = (event: WechatTouchEvent) => {
        for (const touch of changedTouches(event)) {
            const state = pointerState(touch);
            primaryPointerId ??= state.pointerId;
            activePointers.set(state.pointerId, state);
            dispatch('pointerdown', state, canvas as unknown as EventTarget, 1);
        }
    };
    const handleMove = (event: WechatTouchEvent) => {
        for (const touch of changedTouches(event)) {
            const state = pointerState(touch);
            activePointers.set(state.pointerId, state);
            dispatch('pointermove', state, canvas as unknown as EventTarget, 1);
        }
    };
    const release = (event: WechatTouchEvent, cancelled: boolean) => {
        const touches = event.changedTouches?.length
            ? event.changedTouches.map(pointerState)
            : [...activePointers.values()];
        for (const state of touches) {
            dispatch(
                'pointerup',
                state,
                cancelled ? globalThis as unknown as EventTarget : canvas as unknown as EventTarget,
                0,
            );
            activePointers.delete(state.pointerId);
        }
        if (primaryPointerId !== null && !activePointers.has(primaryPointerId)) {
            primaryPointerId = activePointers.keys().next().value ?? null;
        }
    };
    const handleEnd = (event: WechatTouchEvent) => release(event, false);
    const handleCancel = (event: WechatTouchEvent) => release(event, true);

    wx.onTouchStart(handleStart);
    wx.onTouchMove(handleMove);
    wx.onTouchEnd(handleEnd);
    wx.onTouchCancel(handleCancel);

    return {
        get activePointerCount() {
            return activePointers.size;
        },
        cancelAll() {
            for (const state of activePointers.values()) {
                dispatch('pointerup', state, globalThis as unknown as EventTarget, 0);
            }
            activePointers.clear();
            primaryPointerId = null;
        },
        dispose() {
            if (disposed) {
                return;
            }
            disposed = true;
            this.cancelAll();
            wx.offTouchStart?.(handleStart);
            wx.offTouchMove?.(handleMove);
            wx.offTouchEnd?.(handleEnd);
            wx.offTouchCancel?.(handleCancel);
        },
    };
}
