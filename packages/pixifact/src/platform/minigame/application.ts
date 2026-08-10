import 'pixi.js/unsafe-eval';
import 'pixi.js/events';
import {
    ColorSource,
    Container,
    EventSystemFeatures,
    Rectangle,
    Ticker,
    UPDATE_PRIORITY,
    WebGLRenderer,
} from 'pixi.js';
import { installMiniGamePixiAdapter } from './adapter';
import { bindMiniGameLifecycle, type MiniGameLifecycleBinding } from './lifecycle';
import { bindMiniGamePointerEvents, type MiniGamePointerBinding, type MiniGamePointerEventSink, type MiniGameTouchCoordinates } from './input';
import { createMiniGameRuntime, type MiniGameRuntime } from './runtime';
import type { MiniGameApi, MiniGameCanvas, MiniGameFetch } from './types';

interface PixiPointerHandlers {
    _onPointerDown(event: Event): void;
    _onPointerMove(event: Event): void;
    _onPointerUp(event: Event): void;
}

export interface MiniGamePixiApplicationOptions {
    antialias?: boolean;
    autoStart?: boolean;
    backgroundAlpha?: number;
    backgroundColor?: ColorSource;
    eventFeatures?: Partial<EventSystemFeatures>;
    onHide?(): void;
    onShow?(): void;
    resolution?: number;
}

export interface MiniGamePixiApplication {
    readonly canvas: MiniGameCanvas;
    destroy(): void;
    readonly input: MiniGamePointerBinding;
    readonly lifecycle: MiniGameLifecycleBinding;
    render(): void;
    readonly renderer: WebGLRenderer;
    readonly runtime: MiniGameRuntime;
    readonly screen: Rectangle;
    readonly stage: Container;
    start(): void;
    stop(): void;
    readonly ticker: Ticker;
}

export async function createMiniGamePixiApplication(
    api: MiniGameApi,
    userAgent: string,
    fetchResource: MiniGameFetch,
    coordinates: MiniGameTouchCoordinates,
    options: MiniGamePixiApplicationOptions = {},
): Promise<MiniGamePixiApplication> {
    const runtime = createMiniGameRuntime(api, userAgent);
    installMiniGamePixiAdapter(api, runtime, fetchResource);
    const renderer = new WebGLRenderer();
    await renderer.init({
        antialias: options.antialias ?? true,
        autoDensity: false,
        backgroundAlpha: options.backgroundAlpha ?? 1,
        backgroundColor: options.backgroundColor ?? 0x000000,
        canvas: runtime.canvas as unknown as HTMLCanvasElement,
        context: runtime.context as WebGL2RenderingContext,
        eventFeatures: options.eventFeatures ?? {
            click: true,
            globalMove: true,
            move: true,
            wheel: false,
        },
        height: runtime.height,
        resolution: options.resolution ?? runtime.resolution,
        skipExtensionImports: true,
        width: runtime.width,
    });
    const stage = new Container();
    const screen = new Rectangle(0, 0, runtime.width, runtime.height);
    const ticker = new Ticker();
    const render = () => renderer.render(stage);
    const events = renderer.events as unknown as PixiPointerHandlers;
    const sink: MiniGamePointerEventSink = {
        pointerdown: (event) => events._onPointerDown(event),
        pointermove: (event) => events._onPointerMove(event),
        pointerup: (event) => events._onPointerUp(event),
    };
    const input = bindMiniGamePointerEvents(api, runtime.canvas, sink, coordinates);
    const lifecycle = bindMiniGameLifecycle(api, ticker, {
        onHide: () => {
            input.cancelAll();
            options.onHide?.();
        },
        onShow: options.onShow,
    });
    let destroyed = false;
    ticker.add(render, undefined, UPDATE_PRIORITY.LOW);
    render();
    if (options.autoStart !== false) {
        ticker.start();
    }
    return {
        canvas: runtime.canvas,
        destroy() {
            if (destroyed) {
                return;
            }
            destroyed = true;
            lifecycle.dispose();
            input.dispose();
            ticker.destroy();
            stage.destroy({ children: true });
            renderer.destroy();
        },
        input,
        lifecycle,
        render,
        renderer,
        runtime,
        screen,
        stage,
        start: () => ticker.start(),
        stop: () => ticker.stop(),
        ticker,
    };
}
