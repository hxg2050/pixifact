import { Graphics } from 'pixi.js';

export interface Enemy {
    sprite: Graphics;
    x: number;
    y: number;
    speed: number;
}

export function createEnemy(x: number, wave: number): Enemy {
    const sprite = new Graphics()
        .circle(0, 0, 14)
        .fill(0xff5d73)
        .stroke({ color: 0x7f1d1d, width: 2 });
    return {
        sprite,
        x,
        y: -24,
        speed: 1.2 + wave * 0.18,
    };
}
