import { describe, expect, it, vi } from 'vitest';
import { Graphics } from 'pixi.js';
import { parseSceneTemplate } from 'pixifact/compiler';
import { SceneDocument } from '../apps/editor/src/document/SceneDocument';
import {
    fitSceneCanvasView,
    moveSceneCanvasGeometry,
    panSceneCanvasView,
    resizeLayoutManagedSceneCanvasGeometry,
    resizeSceneCanvasView,
    resizeSceneCanvasGeometry,
    sceneCanvasNodePositionIsLayoutManaged,
    zoomSceneCanvasView,
} from '../apps/editor/src/preview/sceneCanvasGeometry';
import { redrawSceneCanvasGraphics } from '../apps/editor/src/preview/sceneCanvasGraphics';

describe('Editor Scene canvas geometry', () => {
    it('fits a Scene in the viewport without scaling it above 100%', () => {
        expect(fitSceneCanvasView(
            { width: 1_000, height: 600 },
            { width: 400, height: 300 },
        )).toEqual({ scale: 1, x: 300, y: 150 });
        expect(fitSceneCanvasView(
            { width: 300, height: 200 },
            { width: 600, height: 200 },
        )).toEqual({ scale: 0.5, x: 0, y: 50 });
    });

    it('pans the canvas view without changing its scale', () => {
        expect(panSceneCanvasView(
            { x: 120, y: 80, scale: 0.5 },
            { x: -30, y: 45 },
        )).toEqual({ x: 90, y: 125, scale: 0.5 });
    });

    it('keeps the viewport center on the same Scene coordinate after resizing', () => {
        const view = { x: 100, y: 50, scale: 0.5 };
        const previousViewport = { width: 800, height: 600 };
        const nextViewport = { width: 1_000, height: 700 };
        const next = resizeSceneCanvasView(view, previousViewport, nextViewport);

        expect(next).toEqual({ x: 200, y: 100, scale: 0.5 });
        expect((previousViewport.width / 2 - view.x) / view.scale).toBe(
            (nextViewport.width / 2 - next.x) / next.scale,
        );
        expect((previousViewport.height / 2 - view.y) / view.scale).toBe(
            (nextViewport.height / 2 - next.y) / next.scale,
        );
    });

    it('zooms around the pointer without changing its Scene coordinate', () => {
        const view = { x: 120, y: 80, scale: 0.5 };
        const pointer = { x: 420, y: 260 };
        const next = zoomSceneCanvasView(view, pointer, -120);

        expect(next.scale).toBeGreaterThan(view.scale);
        expect((pointer.x - next.x) / next.scale).toBeCloseTo(
            (pointer.x - view.x) / view.scale,
        );
        expect((pointer.y - next.y) / next.scale).toBeCloseTo(
            (pointer.y - view.y) / view.scale,
        );
    });

    it('limits canvas zoom between 10% and 400%', () => {
        const view = { x: 120, y: 80, scale: 1 };
        const pointer = { x: 420, y: 260 };

        expect(zoomSceneCanvasView(view, pointer, -100_000).scale).toBe(4);
        expect(zoomSceneCanvasView(view, pointer, 100_000).scale).toBe(0.1);
    });

    it('commits a canvas drag as one saved Scene command', async () => {
        const source = [
            '<Scene name="Menu">',
            '  <Rect id="panel" x="20" y="10" width="100" height="60" />',
            '</Scene>',
            '',
        ].join('\n');
        const api = {
            readScene: vi.fn(async () => ({
                path: 'src/scenes/Menu.scene',
                source,
                version: 'sha256:before',
            })),
            writeScene: vi.fn(async () => ({
                path: 'src/scenes/Menu.scene',
                version: 'sha256:after',
            })),
        };
        const document = await SceneDocument.open('src/scenes/Menu.scene', api);
        const changes = moveSceneCanvasGeometry(
            { x: 20, y: 10, width: 100, height: 60 },
            { x: 20, y: 10, width: 100, height: 60 },
            { x: 12, y: -4 },
        )!;

        await document.commitCommand({
            op: 'batch',
            commands: changes.map((change) => ({
                op: 'setNodeProp' as const,
                node: '0:panel',
                prop: change.prop,
                value: change.value,
            })),
        });

        expect(api.writeScene).toHaveBeenCalledTimes(1);
        expect(document.source).toContain('x="32"');
        expect(document.source).toContain('y="6"');

        await document.undo();

        expect(api.writeScene).toHaveBeenCalledTimes(2);
        expect(document.source).toContain('x="20"');
        expect(document.source).toContain('y="10"');
    });

    it('moves a free node with x and y properties', () => {
        expect(moveSceneCanvasGeometry(
            { x: 20, y: 10 },
            { x: 20, y: 10, width: 100, height: 60 },
            { x: 12, y: -4 },
        )).toEqual([
            { prop: 'x', value: 32 },
            { prop: 'y', value: 6 },
        ]);

        expect(moveSceneCanvasGeometry(
            { x: 20, y: 10 },
            { x: 20, y: 10, width: 100, height: 60 },
            { x: 0.001, y: 0.001 },
        )).toEqual([]);
    });

    it('moves frame-layout nodes without replacing their constraints', () => {
        expect(moveSceneCanvasGeometry(
            { left: 20, right: 30, top: 10, bottom: 15 },
            { x: 20, y: 10, width: 350, height: 215 },
            { x: 12, y: -4 },
        )).toEqual([
            { prop: 'left', value: 32 },
            { prop: 'right', value: 18 },
            { prop: 'top', value: 6 },
            { prop: 'bottom', value: 19 },
        ]);
    });

    it('resizes constrained and centered nodes through their current layout model', () => {
        expect(resizeSceneCanvasGeometry(
            { left: 20, right: 30, top: 10, bottom: 15 },
            { x: 20, y: 10, width: 350, height: 215 },
            'se',
            { x: -20, y: 10 },
        )).toEqual([
            { prop: 'right', value: 50 },
            { prop: 'bottom', value: 5 },
        ]);

        expect(resizeSceneCanvasGeometry(
            { horizontal: 0, vertical: 0, width: 100, height: 60 },
            { x: 150, y: 90, width: 100, height: 60 },
            'nw',
            { x: 20, y: 10 },
        )).toEqual([
            { prop: 'horizontal', value: 10 },
            { prop: 'width', value: 80 },
            { prop: 'vertical', value: 5 },
            { prop: 'height', value: 50 },
        ]);
    });

    it('keeps resized nodes at a positive size', () => {
        expect(resizeSceneCanvasGeometry(
            { x: 20, y: 10, width: 100, height: 60 },
            { x: 20, y: 10, width: 100, height: 60 },
            'nw',
            { x: 200, y: 100 },
        )).toEqual([
            { prop: 'x', value: 119 },
            { prop: 'width', value: 1 },
            { prop: 'y', value: 69 },
            { prop: 'height', value: 1 },
        ]);
    });

    it('redraws Graphics geometry without overwriting Pixi methods or applying scale twice', () => {
        const target = new Graphics();

        redrawSceneCanvasGraphics(target, {
            width: 100,
            height: 60,
            fill: 0xe5e7eb,
        }, {
            width: 120,
            fill: 0x336699,
        });

        const bounds = target.getLocalBounds();
        expect(bounds.maxX - bounds.minX).toBe(120);
        expect(bounds.maxY - bounds.minY).toBe(60);
        expect(target.scale).toMatchObject({ x: 1, y: 1 });
        expect(typeof target.fill).toBe('function');
        target.destroy();
    });

    it('does not edit geometry controlled by a binding', () => {
        expect(moveSceneCanvasGeometry(
            { horizontal: { kind: 'binding', path: ['offset'] }, y: 10 },
            { x: 20, y: 10, width: 100, height: 60 },
            { x: 12, y: 0 },
        )).toBeUndefined();
    });

    it('recognizes children owned by stack layout containers', () => {
        const template = parseSceneTemplate([
            '<Scene name="Menu">',
            '  <HBoxContainer id="row">',
            '    <Rect id="first" />',
            '  </HBoxContainer>',
            '  <Group id="free">',
            '    <Rect id="second" />',
            '  </Group>',
            '</Scene>',
        ].join('\n'));

        expect(sceneCanvasNodePositionIsLayoutManaged(template, '0:row/0:first')).toBe(true);
        expect(sceneCanvasNodePositionIsLayoutManaged(template, '1:free/0:second')).toBe(false);
    });

    it('resizes stack-layout children through width and height without authoring x or y', () => {
        expect(resizeLayoutManagedSceneCanvasGeometry(
            { width: 148, height: 64 },
            { x: 166, y: 4, width: 148, height: 64 },
            'se',
            { x: 12, y: 8 },
        )).toEqual([
            { prop: 'width', value: 160 },
            { prop: 'height', value: 72 },
        ]);
        expect(resizeLayoutManagedSceneCanvasGeometry(
            { left: 0, right: 0, width: 148, height: 64 },
            { x: 166, y: 4, width: 148, height: 64 },
            'e',
            { x: 12, y: 0 },
        )).toEqual([
            { prop: 'width', value: 160 },
        ]);
        expect(resizeLayoutManagedSceneCanvasGeometry(
            { width: 148, height: 64 },
            { x: 166, y: 4, width: 148, height: 64 },
            'w',
            { x: -12, y: 0 },
        )).toBeUndefined();
    });
});
