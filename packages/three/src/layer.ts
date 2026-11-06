import { DOMAdapter, RendererType, UPDATE_PRIORITY, type Application, type WebGLRenderer as PixiWebGLRenderer } from 'pixi.js';
import { Raycaster, Vector2, WebGLRenderer, type Camera, type Object3D, type PerspectiveCamera, type Scene, type WebGLRendererParameters } from 'three';
import { createThreeInput } from './input';

export interface ThreeLayerOptions {
    scene: Scene;
    camera: Camera;
    rendererOptions?: Omit<WebGLRendererParameters, 'canvas' | 'context'>;
    /** 用于多 pass、后处理等原生 Three 绘制。默认调用 renderer.render(scene, camera)。 */
    renderScene?: (renderer: WebGLRenderer, scene: Scene, camera: Camera) => void;
    /** 自定义投影或布局；透视相机的 aspect 由插件自动更新。 */
    onResize?: (width: number, height: number) => void;
}

export interface ThreeScreenshot {
    width: number;
    height: number;
    dataUrl: string;
}

export interface ThreeLayer {
    readonly renderer: WebGLRenderer;
    readonly scene: Scene;
    readonly camera: Camera;
    /** 交给 OrbitControls 等控件的输入元素，只接收未被 UI 占用的手势。 */
    readonly input: HTMLElement;
    raycast(event: { clientX: number; clientY: number }, objects: Object3D[], recursive?: boolean): ReturnType<Raycaster['intersectObjects']>;
    render(): void;
    /** Web Runtime 的完整合成截图；与 registerPixiRuntime 的 captureScreenshot 选项配合使用。 */
    captureScreenshot(): ThreeScreenshot;
    /** 只释放插件拥有的 renderer/输入；模型、材质、纹理由游戏释放。 */
    destroy(): void;
}

export function createThreeLayer(app: Application, options: ThreeLayerOptions): ThreeLayer {
    const pixi = app.renderer as PixiWebGLRenderer;
    if (pixi.type !== RendererType.WEBGL || pixi.context.webGLVersion !== 2) {
        throw new Error('@pixifact/three 需要 WebGL2 Application；创建时设置 preference: "webgl"。');
    }
    const { scene, camera } = options;
    // Pixi 初始化纹理后可能保留 premultiply unpack 状态；Three 构造时就会上传 3D 占位纹理。
    pixi.resetState();
    const renderer = new WebGLRenderer({ ...options.rendererOptions, canvas: app.canvas, context: pixi.gl });
    const input = createThreeInput(app);
    const raycaster = new Raycaster();
    const pointer = new Vector2();
    const originalRender = app.render;
    const originalDestroy = app.destroy;
    let width = -1;
    let height = -1;
    let resolution = -1;
    let destroyed = false;

    const layer: ThreeLayer = {
        renderer, scene, camera, input: input.element,
        raycast(event, objects, recursive = true) {
            const rect = app.canvas.getBoundingClientRect();
            pointer.set(
                ((event.clientX - rect.left) / rect.width) * 2 - 1,
                1 - ((event.clientY - rect.top) / rect.height) * 2,
            );
            scene.updateMatrixWorld();
            camera.updateMatrixWorld();
            raycaster.setFromCamera(pointer, camera);
            return raycaster.intersectObjects(objects, recursive);
        },
        render() {
            if (width !== app.screen.width || height !== app.screen.height || resolution !== pixi.resolution) {
                width = app.screen.width;
                height = app.screen.height;
                resolution = pixi.resolution;
                renderer.setDrawingBufferSize(width, height, resolution);
                if ((camera as PerspectiveCamera).isPerspectiveCamera) {
                    (camera as PerspectiveCamera).aspect = width / height;
                    (camera as PerspectiveCamera).updateProjectionMatrix();
                }
                options.onResize?.(width, height);
            }
            renderer.resetState();
            renderer.setRenderTarget(null);
            if (options.renderScene) options.renderScene(renderer, scene, camera);
            else renderer.render(scene, camera);
            pixi.resetState();
            pixi.render({ container: app.stage, clear: false });
        },
        captureScreenshot() {
            layer.render();
            const captureWidth = Math.max(1, Math.floor(app.screen.width));
            const captureHeight = Math.max(1, Math.floor(app.screen.height));
            const canvas = DOMAdapter.get().createCanvas(captureWidth, captureHeight) as HTMLCanvasElement;
            const context = canvas.getContext('2d') as CanvasRenderingContext2D;
            context.drawImage(app.canvas as HTMLCanvasElement, 0, 0, captureWidth, captureHeight);
            return { width: captureWidth, height: captureHeight, dataUrl: canvas.toDataURL('image/png') };
        },
        destroy() {
            if (destroyed) return;
            destroyed = true;
            app.ticker.remove(layer.render, app);
            app.render = originalRender;
            app.destroy = originalDestroy;
            app.ticker.add(originalRender, app, UPDATE_PRIORITY.LOW);
            input.destroy();
            renderer.dispose();
            pixi.resetState();
        },
    };
    app.ticker.remove(originalRender, app);
    app.render = layer.render;
    app.ticker.add(layer.render, app, UPDATE_PRIORITY.LOW);
    app.destroy = (...args: Parameters<Application['destroy']>) => {
        layer.destroy();
        originalDestroy.apply(app, args);
    };
    return layer;
}
