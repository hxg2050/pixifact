import type { Container } from 'pixi.js';

export interface CircleBody {
    x: number;
    y: number;
    radius: number;
}

export function circlesOverlap(a: CircleBody, b: CircleBody) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const radius = a.radius + b.radius;
    return dx * dx + dy * dy <= radius * radius;
}

export function containerCircle(container: Container, radius: number): CircleBody {
    return {
        x: container.x,
        y: container.y,
        radius,
    };
}
