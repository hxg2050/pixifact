import type { Application, ApplicationOptions } from 'pixi.js';
import { installMiniGamePixiAdapter } from './adapter';
import { bindMiniGameLifecycle } from './lifecycle';
import { bindMiniGamePointerEvents, type MiniGamePointerEventSink, type MiniGameTouchCoordinates } from './input';
import { createMiniGameRuntime } from './runtime';
import type { MiniGameApi, MiniGameFetch } from './types';

interface PixiPointerHandlers {
    _onPointerDown(event: Event): void;
    _onPointerMove(event: Event): void;
    _onPointerUp(event: Event): void;
}

export async function createMiniGameApplication(
    api: MiniGameApi,
    userAgent: string,
    fetchResource: MiniGameFetch,
    coordinates: MiniGameTouchCoordinates,
    options: Partial<ApplicationOptions> = {},
): Promise<Application> {
    await Promise.all([
        import('pixi.js/unsafe-eval'),
        import('pixi.js/events'),
    ]);
    const { Application } = await import('pixi.js');
    const runtime = createMiniGameRuntime(api, userAgent);
    await installMiniGamePixiAdapter(api, runtime, fetchResource);
    const app = new Application();
    await app.init({
        antialias: true,
        ...options,
        autoDensity: false,
        canvas: runtime.canvas as unknown as HTMLCanvasElement,
        context: runtime.context as WebGL2RenderingContext,
        eventFeatures: options.eventFeatures ?? {
            click: true,
            globalMove: true,
            move: true,
            wheel: false,
        },
        height: runtime.height,
        preference: 'webgl',
        resolution: options.resolution ?? runtime.resolution,
        skipExtensionImports: true,
        width: runtime.width,
    });
    const events = app.renderer.events as unknown as PixiPointerHandlers;
    const sink: MiniGamePointerEventSink = {
        pointerdown: (event) => events._onPointerDown(event),
        pointermove: (event) => events._onPointerMove(event),
        pointerup: (event) => events._onPointerUp(event),
    };
    const input = bindMiniGamePointerEvents(api, runtime.canvas, sink, coordinates);
    const lifecycle = bindMiniGameLifecycle(api, app.ticker, {
        onHide: () => input.cancelAll(),
    });
    let destroyed = false;
    const destroy = app.destroy.bind(app);
    app.destroy = ((...args: Parameters<Application['destroy']>) => {
        if (destroyed) return;
        destroyed = true;
        lifecycle.dispose();
        input.dispose();
        destroy(...args);
    }) as Application['destroy'];
    return app;
}
