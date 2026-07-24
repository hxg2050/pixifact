import 'pixi.js/unsafe-eval';
import 'pixi.js/events';
import {
    Container,
    DOMAdapter,
    loadTextures,
    Rectangle,
    Ticker,
    UPDATE_PRIORITY,
    WebGLRenderer,
    type ColorSource,
    type EventSystemFeatures,
} from 'pixi.js';
import { createWechatPixiAdapter } from './adapter';
import { bindWechatPointerEvents, type WechatPointerBinding, type WechatPointerEventSink } from './input';
import { bindWechatLifecycle, type WechatLifecycleBinding } from './lifecycle';
import { createWechatRuntime, type WechatRuntime } from './runtime';
import type { WechatCanvas } from './types';

interface PixiPointerHandlers {
    _onPointerDown(event: Event): void;
    _onPointerMove(event: Event): void;
    _onPointerUp(event: Event): void;
}

export interface WechatPixiApplicationOptions {
    antialias?: boolean;
    autoStart?: boolean;
    backgroundAlpha?: number;
    backgroundColor?: ColorSource;
    eventFeatures?: Partial<EventSystemFeatures>;
    onHide?(): void;
    onShow?(): void;
    resolution?: number;
}

export interface WechatPixiApplication {
    readonly canvas: WechatCanvas;
    destroy(): void;
    readonly input: WechatPointerBinding;
    readonly lifecycle: WechatLifecycleBinding;
    render(): void;
    readonly renderer: WebGLRenderer;
    readonly runtime: WechatRuntime;
    readonly screen: Rectangle;
    readonly stage: Container;
    start(): void;
    stop(): void;
    readonly ticker: Ticker;
}

export async function createWechatPixiApplication(
    options: WechatPixiApplicationOptions = {},
): Promise<WechatPixiApplication> {
    const runtime = createWechatRuntime();
    DOMAdapter.set(createWechatPixiAdapter(runtime) as unknown as Parameters<typeof DOMAdapter.set>[0]);
    loadTextures.config!.preferCreateImageBitmap = false;
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
            globalMove: false,
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
    const sink: WechatPointerEventSink = {
        pointerdown: (event) => events._onPointerDown(event),
        pointermove: (event) => events._onPointerMove(event),
        pointerup: (event) => events._onPointerUp(event),
    };
    const input = bindWechatPointerEvents(runtime.canvas, sink);
    const lifecycle = bindWechatLifecycle(ticker, {
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
