import { Graphics } from 'pixi.js';
import { pixiSceneNodeDefaults, type SceneTemplateValue } from 'pixifact/compiler';

export const graphicsDrawingProps = new Set([
    'width',
    'height',
    'shape',
    'radius',
    'fill',
    'fillAlpha',
    'strokeColor',
    'strokeWidth',
    'strokeAlpha',
]);

export function redrawSceneCanvasGraphics(
    target: Graphics,
    props: Record<string, SceneTemplateValue>,
    overrides: Record<string, SceneTemplateValue>,
) {
    const values = { ...pixiSceneNodeDefaults('Graphics'), ...props, ...overrides };
    const width = Number(values.width ?? 100);
    const height = Number(values.height ?? 60);
    target.clear();
    if (values.shape === 'rect') {
        target.rect(0, 0, width, height);
    } else {
        target.roundRect(0, 0, width, height, Number(values.radius ?? 0));
    }
    target.fill({ color: Number(values.fill ?? 0xe5e7eb), alpha: Number(values.fillAlpha ?? 1) });
    if (Number(values.strokeWidth ?? 0) > 0) {
        target.stroke({
            color: Number(values.strokeColor ?? 0),
            alpha: Number(values.strokeAlpha ?? 1),
            width: Number(values.strokeWidth),
        });
    }
}
