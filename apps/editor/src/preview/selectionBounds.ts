import type { Group } from '../../../../src';

export interface SelectionBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

function boundsFromLocalRect(node: Group, width: number, height: number): SelectionBounds {
    const points = [
        node.display.toGlobal({ x: 0, y: 0 }),
        node.display.toGlobal({ x: width, y: 0 }),
        node.display.toGlobal({ x: width, y: height }),
        node.display.toGlobal({ x: 0, y: height }),
    ];
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);

    return {
        x: minX,
        y: minY,
        width: Math.max(maxX - minX, 1),
        height: Math.max(maxY - minY, 1),
    };
}

export function selectionBoundsForNode(node: Group): SelectionBounds | undefined {
    if (node.width > 0 || node.height > 0) {
        return boundsFromLocalRect(node, Math.max(node.width, 1), Math.max(node.height, 1));
    }

    const bounds = node.display.getBounds();
    if (bounds.width <= 0 || bounds.height <= 0) {
        const point = node.display.toGlobal({ x: 0, y: 0 });
        return {
            x: point.x - 8,
            y: point.y - 8,
            width: 16,
            height: 16,
        };
    }

    return {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
    };
}
