import { MiniGamePointerEvent } from './runtime';
import type { MiniGameApi, MiniGameCanvas, MiniGameTouch, MiniGameTouchEvent } from './types';

interface PointerState {
    force: number;
    pointerId: number;
    x: number;
    y: number;
}

export interface MiniGamePointerEventSink {
    pointerdown(event: Event): void;
    pointermove(event: Event): void;
    pointerup(event: Event): void;
}

export interface MiniGamePointerBinding {
    readonly activePointerCount: number;
    cancelAll(): void;
    dispose(): void;
}

export type MiniGameTouchCoordinates = (touch: MiniGameTouch) => { x: number; y: number };

function pointerState(touch: MiniGameTouch, coordinates: MiniGameTouchCoordinates): PointerState {
    const point = coordinates(touch);
    return {
        force: touch.force ?? 0.5,
        pointerId: (touch.identifier ?? 0) + 1,
        x: point.x,
        y: point.y,
    };
}

function changedTouches(event: MiniGameTouchEvent) {
    return event.changedTouches?.length ? event.changedTouches : event.touches ?? [];
}

export function bindMiniGamePointerEvents(
    api: MiniGameApi,
    canvas: MiniGameCanvas,
    sink: MiniGamePointerEventSink,
    coordinates: MiniGameTouchCoordinates,
): MiniGamePointerBinding {
    const activePointers = new Map<number, PointerState>();
    let disposed = false;
    let primaryPointerId: number | null = null;

    const dispatch = (
        type: 'pointerdown' | 'pointermove' | 'pointerup',
        state: PointerState,
        eventTarget: EventTarget,
        buttons: number,
    ) => {
        const event = new MiniGamePointerEvent(type, {
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

    const handleStart = (event: MiniGameTouchEvent) => {
        for (const touch of changedTouches(event)) {
            const state = pointerState(touch, coordinates);
            primaryPointerId ??= state.pointerId;
            activePointers.set(state.pointerId, state);
            dispatch('pointerdown', state, canvas as unknown as EventTarget, 1);
        }
    };
    const handleMove = (event: MiniGameTouchEvent) => {
        for (const touch of changedTouches(event)) {
            const state = pointerState(touch, coordinates);
            activePointers.set(state.pointerId, state);
            dispatch('pointermove', state, canvas as unknown as EventTarget, 1);
        }
    };
    const release = (event: MiniGameTouchEvent, cancelled: boolean) => {
        const touches = event.changedTouches?.length
            ? event.changedTouches.map((touch) => pointerState(touch, coordinates))
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
    const handleEnd = (event: MiniGameTouchEvent) => release(event, false);
    const handleCancel = (event: MiniGameTouchEvent) => release(event, true);

    api.onTouchStart(handleStart);
    api.onTouchMove(handleMove);
    api.onTouchEnd(handleEnd);
    api.onTouchCancel(handleCancel);

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
            api.offTouchStart?.(handleStart);
            api.offTouchMove?.(handleMove);
            api.offTouchEnd?.(handleEnd);
            api.offTouchCancel?.(handleCancel);
        },
    };
}
