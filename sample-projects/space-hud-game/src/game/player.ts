import { Graphics } from 'pixi.js';

export interface Player {
    sprite: Graphics;
    x: number;
    y: number;
}

export function createPlayer() {
    const sprite = new Graphics()
        .moveTo(0, -18)
        .lineTo(16, 18)
        .lineTo(0, 10)
        .lineTo(-16, 18)
        .closePath()
        .fill(0x64e5ff)
        .stroke({ color: 0x0f172a, width: 2 });

    return {
        sprite,
        x: 480,
        y: 420,
    };
}
