import { Container, type Application, type FederatedPointerEvent, type FederatedWheelEvent } from 'pixi.js';

/** 只供 Three 控件使用的局部事件面，不修改宿主 Canvas / document。 */
export function createThreeInput(app: Application) {
    const surface = new Container({ label: 'Three input', eventMode: 'static' });
    // Pointer down 只来自 Canvas；无限命中面让 UI stage 的视口变换不影响世界输入。
    surface.hitArea = { contains: () => true };
    app.stage.addChildAt(surface, 0);
    const listeners = new Map<string, Map<EventListenerOrEventListenerObject, { once: boolean }>>();
    const active = new Map<number, Event>();
    const captured = new Set<number>();
    const element = {
        style: app.canvas.style,
        get clientWidth() { return app.canvas.getBoundingClientRect().width; },
        get clientHeight() { return app.canvas.getBoundingClientRect().height; },
        get ownerDocument() { return element; },
        getRootNode: () => element,
        getBoundingClientRect: () => app.canvas.getBoundingClientRect(),
        setPointerCapture: (id: number) => { captured.add(id); },
        hasPointerCapture: (id: number) => captured.has(id),
        releasePointerCapture: (id: number) => { captured.delete(id); },
        addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
            const current = listeners.get(type) ?? new Map();
            current.set(listener, { once: typeof options === 'object' && options.once === true });
            listeners.set(type, current);
        },
        removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
            listeners.get(type)?.delete(listener);
        },
    };
    const emit = (event: Event) => {
        for (const [listener, options] of [...(listeners.get(event.type) ?? [])]) {
            if (options.once) listeners.get(event.type)!.delete(listener);
            if (typeof listener === 'function') listener.call(element, event);
            else listener.handleEvent(event);
            if (event.cancelBubble) break;
        }
    };
    const dispatch = (type: string, source: FederatedPointerEvent | FederatedWheelEvent) => {
        const pointer = source as FederatedPointerEvent;
        const wheel = source as FederatedWheelEvent;
        const nativeEvent = source.nativeEvent;
        let prevented = false;
        const event = {
            type, target: element, currentTarget: element,
            clientX: source.clientX, clientY: source.clientY,
            pageX: source.pageX, pageY: source.pageY,
            pointerId: pointer.pointerId, pointerType: pointer.pointerType, isPrimary: pointer.isPrimary,
            button: source.button, buttons: source.buttons,
            altKey: source.altKey, ctrlKey: source.ctrlKey, metaKey: source.metaKey, shiftKey: source.shiftKey,
            deltaX: wheel.deltaX, deltaY: wheel.deltaY, deltaZ: wheel.deltaZ, deltaMode: wheel.deltaMode,
            get defaultPrevented() { return prevented; },
            preventDefault() {
                prevented = true;
                if (nativeEvent && 'preventDefault' in nativeEvent) nativeEvent.preventDefault();
            },
            stopPropagation() {},
            cancelBubble: false,
            stopImmediatePropagation() { event.cancelBubble = true; },
        } as unknown as Event;
        emit(event);
        return event;
    };
    const down = (event: FederatedPointerEvent) => {
        if (event.target !== surface) return;
        active.set(event.pointerId, dispatch('pointerdown', event));
    };
    const move = (event: FederatedPointerEvent) => {
        if (active.has(event.pointerId)) active.set(event.pointerId, dispatch('pointermove', event));
        else if (event.target === surface) dispatch('pointermove', event);
    };
    const up = (event: FederatedPointerEvent) => {
        if (!active.delete(event.pointerId)) return;
        dispatch('pointerup', event);
        captured.delete(event.pointerId);
    };
    const wheel = (event: FederatedWheelEvent) => {
        if (event.target === surface) dispatch('wheel', event);
    };
    const boundary = app.renderer.events.rootBoundary.dispatch;
    boundary.on('pointerdown', down);
    boundary.on('pointermove', move);
    boundary.on('pointerup', up);
    boundary.on('wheel', wheel);
    surface.on('pointerupoutside', up);
    return {
        element: element as unknown as HTMLElement,
        destroy() {
            for (const event of active.values()) emit({ ...event, type: 'pointercancel' } as Event);
            active.clear();
            captured.clear();
            boundary.off('pointerdown', down);
            boundary.off('pointermove', move);
            boundary.off('pointerup', up);
            boundary.off('wheel', wheel);
            listeners.clear();
            surface.destroy();
        },
    };
}
