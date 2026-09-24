import type { SceneCanvasGeometry, SceneCanvasPoint } from './sceneCanvasGeometry';

export type SceneCanvasLayoutAction =
    | { kind: 'align' | 'distribute'; axis: 'x' | 'y'; anchor: 'start' | 'center' | 'end' }
    | { kind: 'space'; axis: 'x' | 'y' };

export function sceneCanvasLayoutDeltas(
    bounds: readonly SceneCanvasGeometry[],
    action: SceneCanvasLayoutAction,
): SceneCanvasPoint[] {
    const start = (item: SceneCanvasGeometry) => item[action.axis];
    const size = (item: SceneCanvasGeometry) => action.axis === 'x' ? item.width : item.height;
    const line = (item: SceneCanvasGeometry) => start(item)
        + (action.kind === 'space' || action.anchor === 'start' ? 0 : action.anchor === 'center' ? size(item) / 2 : size(item));
    const deltas = bounds.map(() => 0);

    if (action.kind === 'align') {
        const first = Math.min(...bounds.map(start));
        const last = Math.max(...bounds.map((item) => start(item) + size(item)));
        const target = action.anchor === 'start' ? first : action.anchor === 'center' ? (first + last) / 2 : last;
        bounds.forEach((item, index) => { deltas[index] = target - line(item); });
    } else {
        const order = bounds.map((item, index) => ({ item, index }))
            .sort((a, b) => (action.kind === 'space' ? start(a.item) - start(b.item) : line(a.item) - line(b.item)) || a.index - b.index);
        if (action.kind === 'distribute') {
            const first = line(order[0].item);
            const step = (line(order.at(-1)!.item) - first) / (order.length - 1);
            order.slice(1, -1).forEach(({ item, index }, position) => {
                deltas[index] = first + step * (position + 1) - line(item);
            });
        } else {
            const first = order[0].item;
            const last = order.at(-1)!.item;
            const span = start(last) + size(last) - start(first);
            const gap = (span - order.reduce((total, { item }) => total + size(item), 0)) / (order.length - 1);
            let cursor = start(first) + size(first) + gap;
            order.slice(1, -1).forEach(({ item, index }) => {
                deltas[index] = cursor - start(item);
                cursor += size(item) + gap;
            });
        }
    }

    return deltas.map((delta) => action.axis === 'x' ? { x: delta, y: 0 } : { x: 0, y: delta });
}
