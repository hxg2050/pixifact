import { afterEach, describe, expect, it, vi } from 'vitest';
import { Container, EventBoundary, FederatedPointerEvent, Graphics, Rectangle, Ticker, type Application } from 'pixi.js';
import { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import 'pixi.js/events';
import { createThreeLayer } from '@pixifact/three';

const mocks = vi.hoisted(() => ({ calls: [] as string[], renderers: [] as any[] }));
vi.mock('three', async (importOriginal) => {
    const actual = await importOriginal<typeof import('three')>();
    return {
        ...actual,
        WebGLRenderer: class {
            autoClear = true;
            callsAtConstruction = [...mocks.calls];
            constructor(public options: unknown) { mocks.renderers.push(this); }
            resetState() { mocks.calls.push('three:reset'); }
            setRenderTarget() {}
            setDrawingBufferSize = vi.fn();
            render() { mocks.calls.push('three:render'); }
            dispose = vi.fn();
        },
    };
});

const disposals: Array<() => void> = [];
afterEach(() => {
    for (const dispose of disposals.splice(0)) dispose();
    mocks.calls.length = 0;
    mocks.renderers.length = 0;
});

function setup() {
    const ticker = new Ticker();
    const stage = new Container();
    const boundary = new EventBoundary(stage);
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'getBoundingClientRect', {
        value: () => ({ x: 10, y: 20, left: 10, top: 20, width: 400, height: 300, right: 410, bottom: 320 }),
    });
    const screen = new Rectangle(0, 0, 800, 600);
    const renderer = {
        type: 1,
        context: { webGLVersion: 2 },
        gl: {},
        resolution: 2,
        events: { rootBoundary: boundary },
        resetState() { mocks.calls.push('pixi:reset'); },
        render: vi.fn(() => { mocks.calls.push('pixi:render'); }),
    };
    const app = {
        ticker, stage, canvas, renderer, screen,
        render() { renderer.render({ container: stage } as never); },
        destroy: vi.fn(),
    } as unknown as Application;
    ticker.add(app.render, app, -25);
    const originalRender = app.render;
    const originalDestroy = app.destroy;
    const scene = new Scene();
    const camera = new PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.z = 5;
    camera.updateMatrixWorld();
    const layer = createThreeLayer(app, { scene, camera });
    mocks.calls.length = 0;
    disposals.push(() => { layer.destroy(); ticker.destroy(); stage.destroy({ children: true }); });
    return { app, renderer, boundary, layer, scene, camera, originalRender, originalDestroy };
}

function pointer(boundary: EventBoundary, type: string, x: number, y: number, id = 1) {
    const event = new FederatedPointerEvent(boundary);
    event.type = type;
    event.pointerId = id;
    event.pointerType = 'touch';
    event.button = 0;
    event.buttons = type === 'pointerup' ? 0 : 1;
    event.global.set(x, y);
    event.client.set(10 + x / 2, 20 + y / 2);
    event.page.copyFrom(event.client);
    event.nativeEvent = { preventDefault() {}, type } as PointerEvent;
    boundary.mapEvent(event);
}

describe('@pixifact/three shared runtime', () => {
    it('composes one frame on the application ticker and restores Pixi on detach', () => {
        const { app, layer, renderer, camera, originalRender } = setup();
        app.ticker.update(100);
        expect(mocks.calls).toEqual(['three:reset', 'three:render', 'pixi:reset', 'pixi:render']);
        expect(mocks.renderers[0].options).toMatchObject({ canvas: app.canvas, context: renderer.gl });
        expect(mocks.renderers[0].callsAtConstruction).toEqual(['pixi:reset']);
        expect(renderer.render).toHaveBeenCalledWith({ container: app.stage, clear: false });
        expect(camera.aspect).toBe(800 / 600);
        expect(layer.renderer.setDrawingBufferSize).toHaveBeenCalledWith(800, 600, 2);
        app.screen.width = 600;
        app.screen.height = 800;
        app.render();
        expect(camera.aspect).toBe(600 / 800);
        layer.destroy();
        expect(app.render).toBe(originalRender);
        expect(layer.renderer.dispose).toHaveBeenCalledTimes(1);
        expect(app.stage.children).toHaveLength(0);
        expect(app.canvas.width).toBe(300);
        mocks.calls.length = 0;
        app.ticker.update(120);
        expect(mocks.calls).toEqual(['pixi:render']);
    });

    it('runs the supplied Three render pass before UI and detaches on app.destroy', () => {
        const { app, layer, scene, camera, originalDestroy } = setup();
        layer.destroy();
        mocks.calls.length = 0;
        const renderScene = vi.fn(() => { mocks.calls.push('custom'); });
        const custom = createThreeLayer(app, { scene, camera, renderScene });
        mocks.calls.length = 0;
        app.render();
        expect(renderScene).toHaveBeenCalledWith(custom.renderer, scene, camera);
        expect(mocks.calls).toEqual(['three:reset', 'custom', 'pixi:reset', 'pixi:render']);
        app.destroy();
        expect(custom.renderer.dispose).toHaveBeenCalledOnce();
        expect(originalDestroy).toHaveBeenCalledOnce();
    });

    it('routes empty world gestures to native OrbitControls while UI owns its gestures', () => {
        const { app, boundary, layer, camera } = setup();
        const button = new Graphics().rect(0, 0, 100, 100).fill(0xffffff);
        button.eventMode = 'static';
        const press = vi.fn();
        button.on('pointerdown', press);
        app.stage.addChild(button);
        app.stage.getBounds();
        const controls = new OrbitControls(camera, layer.input);
        const start = vi.fn();
        const end = vi.fn();
        controls.addEventListener('start', start);
        controls.addEventListener('end', end);
        disposals.push(() => controls.dispose());
        const before = camera.position.clone();
        pointer(boundary, 'pointerdown', 50, 50);
        pointer(boundary, 'pointermove', 300, 50);
        pointer(boundary, 'pointerup', 300, 50);
        expect(press).toHaveBeenCalledOnce();
        expect(start).not.toHaveBeenCalled();
        expect(camera.position.equals(before)).toBe(true);
        pointer(boundary, 'pointerdown', 300, 200);
        pointer(boundary, 'pointermove', 50, 50);
        pointer(boundary, 'pointerup', 50, 50);
        expect(start).toHaveBeenCalledOnce();
        expect(end).toHaveBeenCalledOnce();
        expect(camera.position.equals(before)).toBe(false);
        expect(layer.input.hasPointerCapture(1)).toBe(false);
    });

    it('raycasts using CSS canvas coordinates and preserves model ownership', () => {
        const { layer, scene } = setup();
        const geometry = new BoxGeometry();
        const material = new MeshBasicMaterial();
        const mesh = new Mesh(geometry, material);
        scene.add(mesh);
        scene.updateMatrixWorld();
        const dispose = vi.spyOn(geometry, 'dispose');
        expect(layer.raycast({ clientX: 210, clientY: 170 }, [mesh])[0].object).toBe(mesh);
        expect(layer.raycast({ clientX: 10, clientY: 20 }, [mesh])).toEqual([]);
        layer.destroy();
        expect(dispose).not.toHaveBeenCalled();
        expect(mesh.position).toEqual(new Vector3());
        geometry.dispose();
        material.dispose();
    });

    it('covers the canvas when the UI stage is scaled or translated and releases outside pointers', () => {
        const { app, layer, boundary, camera } = setup();
        app.stage.position.set(100, 100);
        app.stage.scale.set(2);
        app.stage.getBounds();
        const controls = new OrbitControls(camera, layer.input);
        disposals.push(() => controls.dispose());
        const start = vi.fn();
        const end = vi.fn();
        controls.addEventListener('start', start);
        controls.addEventListener('end', end);
        pointer(boundary, 'pointerdown', 5, 5);
        expect(start).toHaveBeenCalledOnce();
        pointer(boundary, 'pointerupoutside', -10, -10);
        expect(end).toHaveBeenCalledOnce();
        expect(layer.input.hasPointerCapture(1)).toBe(false);
    });
});
