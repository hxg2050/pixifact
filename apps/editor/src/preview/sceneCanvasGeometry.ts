import {
    isSceneTemplateBindingValue,
    type SceneTemplate,
    type SceneTemplateValue,
} from 'pixifact/compiler';
import type { Container } from 'pixi.js';
import { findSceneTreeEntry } from '../document/sceneTree';

export type SceneCanvasResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export interface SceneCanvasGeometry {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface SceneCanvasPoint {
    x: number;
    y: number;
}

export interface SceneCanvasView {
    scale: number;
    x: number;
    y: number;
}

export function sceneCanvasNodeCanStartDrag(selectedLocator: string | undefined, locator: string) {
    return selectedLocator === locator;
}

export function sceneCanvasEventTargetIsWithinNode(node: Container, target: unknown) {
    let current = target as Container | null;
    while (current) {
        if (current === node) return true;
        current = current.parent;
    }
    return false;
}

export interface SceneCanvasSize {
    width: number;
    height: number;
}

export interface SceneCanvasPropChange {
    prop: string;
    value: number;
}

interface AxisProps {
    center: string;
    end: string;
    position: string;
    size: string;
    start: string;
}

const horizontalAxis: AxisProps = {
    center: 'horizontal',
    end: 'right',
    position: 'x',
    size: 'width',
    start: 'left',
};
const verticalAxis: AxisProps = {
    center: 'vertical',
    end: 'bottom',
    position: 'y',
    size: 'height',
    start: 'top',
};
const stackLayoutTypes = new Set(['GridContainer', 'HBoxContainer', 'VBoxContainer']);
const minSceneCanvasScale = 0.1;
const maxSceneCanvasScale = 4;
const sceneCanvasZoomFactor = 0.002;

export function fitSceneCanvasView(
    viewport: SceneCanvasSize,
    scene: SceneCanvasSize,
): SceneCanvasView {
    const scale = Math.min(viewport.width / scene.width, viewport.height / scene.height, 1);
    return {
        scale,
        x: (viewport.width - scene.width * scale) / 2,
        y: (viewport.height - scene.height * scale) / 2,
    };
}

export function panSceneCanvasView(
    view: SceneCanvasView,
    delta: SceneCanvasPoint,
): SceneCanvasView {
    return {
        scale: view.scale,
        x: view.x + delta.x,
        y: view.y + delta.y,
    };
}

export function resizeSceneCanvasView(
    view: SceneCanvasView,
    previousViewport: SceneCanvasSize,
    nextViewport: SceneCanvasSize,
): SceneCanvasView {
    return panSceneCanvasView(view, {
        x: (nextViewport.width - previousViewport.width) / 2,
        y: (nextViewport.height - previousViewport.height) / 2,
    });
}

export function zoomSceneCanvasView(
    view: SceneCanvasView,
    pointer: SceneCanvasPoint,
    wheelDelta: number,
): SceneCanvasView {
    const scale = Math.min(
        maxSceneCanvasScale,
        Math.max(minSceneCanvasScale, view.scale * Math.exp(-wheelDelta * sceneCanvasZoomFactor)),
    );
    const ratio = scale / view.scale;
    return {
        scale,
        x: pointer.x - (pointer.x - view.x) * ratio,
        y: pointer.y - (pointer.y - view.y) * ratio,
    };
}

export function moveSceneCanvasGeometry(
    props: Record<string, SceneTemplateValue>,
    geometry: SceneCanvasGeometry,
    delta: SceneCanvasPoint,
): SceneCanvasPropChange[] | undefined {
    const horizontal = axisGeometryChanges(
        props,
        horizontalAxis,
        geometry.x,
        geometry.width,
        geometry.x + delta.x,
        geometry.width,
    );
    const vertical = axisGeometryChanges(
        props,
        verticalAxis,
        geometry.y,
        geometry.height,
        geometry.y + delta.y,
        geometry.height,
    );
    return horizontal && vertical ? [...horizontal, ...vertical] : undefined;
}

export function resizeSceneCanvasGeometry(
    props: Record<string, SceneTemplateValue>,
    geometry: SceneCanvasGeometry,
    handle: SceneCanvasResizeHandle,
    delta: SceneCanvasPoint,
): SceneCanvasPropChange[] | undefined {
    const horizontal = resizedAxis(
        geometry.x,
        geometry.width,
        handle.includes('w') ? delta.x : 0,
        handle.includes('e') ? delta.x : 0,
    );
    const vertical = resizedAxis(
        geometry.y,
        geometry.height,
        handle.includes('n') ? delta.y : 0,
        handle.includes('s') ? delta.y : 0,
    );
    const horizontalChanges = axisGeometryChanges(
        props,
        horizontalAxis,
        geometry.x,
        geometry.width,
        horizontal.position,
        horizontal.size,
    );
    const verticalChanges = axisGeometryChanges(
        props,
        verticalAxis,
        geometry.y,
        geometry.height,
        vertical.position,
        vertical.size,
    );
    return horizontalChanges && verticalChanges
        ? [...horizontalChanges, ...verticalChanges]
        : undefined;
}

export function resizeLayoutManagedSceneCanvasGeometry(
    props: Record<string, SceneTemplateValue>,
    geometry: SceneCanvasGeometry,
    handle: SceneCanvasResizeHandle,
    delta: SceneCanvasPoint,
): SceneCanvasPropChange[] | undefined {
    if (handle !== 'e' && handle !== 's' && handle !== 'se') return undefined;
    const changes: SceneCanvasPropChange[] = [];
    if (
        handle.includes('e')
        && !setGeometryNumber(changes, props, 'width', Math.max(1, geometry.width + delta.x), geometry.width)
    ) {
        return undefined;
    }
    if (
        handle.includes('s')
        && !setGeometryNumber(changes, props, 'height', Math.max(1, geometry.height + delta.y), geometry.height)
    ) {
        return undefined;
    }
    return changes;
}

export function sceneCanvasNodePositionIsLayoutManaged(template: SceneTemplate, locator: string) {
    const entry = findSceneTreeEntry(template.children, locator);
    if (!entry || entry.parentLocator === '__scene__') return false;
    const parent = findSceneTreeEntry(template.children, entry.parentLocator)?.node;
    return parent?.kind === 'pixi' && stackLayoutTypes.has(parent.type);
}

function resizedAxis(position: number, size: number, startDelta: number, endDelta: number) {
    let nextStart = position + startDelta;
    let nextEnd = position + size + endDelta;
    if (nextEnd - nextStart < 1) {
        if (startDelta !== 0) {
            nextStart = nextEnd - 1;
        } else {
            nextEnd = nextStart + 1;
        }
    }
    return {
        position: nextStart,
        size: nextEnd - nextStart,
    };
}

function axisGeometryChanges(
    props: Record<string, SceneTemplateValue>,
    axis: AxisProps,
    position: number,
    size: number,
    nextPosition: number,
    nextSize: number,
): SceneCanvasPropChange[] | undefined {
    const positionDelta = nextPosition - position;
    const sizeDelta = nextSize - size;
    const endDelta = positionDelta + sizeDelta;
    if (positionDelta === 0 && sizeDelta === 0) return [];

    const hasStart = props[axis.start] !== undefined;
    const hasEnd = props[axis.end] !== undefined;
    const hasCenter = props[axis.center] !== undefined;
    const changes: SceneCanvasPropChange[] = [];

    if (hasStart) {
        if (positionDelta !== 0 && !changeExistingNumber(changes, props, axis.start, positionDelta)) {
            return undefined;
        }
        if (hasEnd) {
            if (endDelta !== 0 && !changeExistingNumber(changes, props, axis.end, -endDelta)) {
                return undefined;
            }
            return changes;
        }
        if (sizeDelta !== 0 && !setGeometryNumber(changes, props, axis.size, nextSize, size)) {
            return undefined;
        }
        return changes;
    }

    if (hasEnd) {
        if (endDelta !== 0 && !changeExistingNumber(changes, props, axis.end, -endDelta)) {
            return undefined;
        }
        if (sizeDelta !== 0 && !setGeometryNumber(changes, props, axis.size, nextSize, size)) {
            return undefined;
        }
        return changes;
    }

    if (hasCenter) {
        const centerDelta = positionDelta + sizeDelta / 2;
        if (centerDelta !== 0 && !changeExistingNumber(changes, props, axis.center, centerDelta)) {
            return undefined;
        }
        if (sizeDelta !== 0 && !setGeometryNumber(changes, props, axis.size, nextSize, size)) {
            return undefined;
        }
        return changes;
    }

    if (positionDelta !== 0 && !setGeometryNumber(changes, props, axis.position, nextPosition, position)) {
        return undefined;
    }
    if (sizeDelta !== 0 && !setGeometryNumber(changes, props, axis.size, nextSize, size)) {
        return undefined;
    }
    return changes;
}

function changeExistingNumber(
    changes: SceneCanvasPropChange[],
    props: Record<string, SceneTemplateValue>,
    prop: string,
    delta: number,
) {
    const value = props[prop];
    if (typeof value !== 'number') return false;
    const next = roundGeometry(value + delta);
    if (next !== value) changes.push({ prop, value: next });
    return true;
}

function setGeometryNumber(
    changes: SceneCanvasPropChange[],
    props: Record<string, SceneTemplateValue>,
    prop: string,
    value: number,
    current: number,
) {
    const source = props[prop];
    if (isSceneTemplateBindingValue(source)) return false;
    const next = roundGeometry(value);
    if (next !== roundGeometry(current)) changes.push({ prop, value: next });
    return true;
}

function roundGeometry(value: number) {
    return Math.round(value * 100) / 100;
}
