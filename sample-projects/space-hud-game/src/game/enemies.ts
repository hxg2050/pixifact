import { Container, Graphics } from 'pixi.js';
import { computeDesignBounds } from './viewport';

export class Asteroid extends Container {
    readonly radius: number;
    speed: number;

    constructor(radius: number, speed: number) {
        super();
        this.radius = radius;
        this.speed = speed;

        const body = new Graphics()
            .poly([
                -radius * 0.7, -radius * 0.35,
                -radius * 0.15, -radius,
                radius * 0.75, -radius * 0.5,
                radius, radius * 0.25,
                radius * 0.25, radius,
                -radius * 0.85, radius * 0.55,
            ])
            .fill(0x8b5cf6)
            .stroke({ width: 3, color: 0xe9d5ff });
        this.addChild(body);
    }

    update(deltaSeconds: number) {
        this.y += this.speed * deltaSeconds;
        this.rotation += deltaSeconds * 0.8;
    }
}

export function spawnAsteroid(wave: number, random = Math.random) {
    const bounds = computeDesignBounds();
    const radius = 24 + random() * 24;
    const speed = 190 + wave * 26 + random() * 90;
    const asteroid = new Asteroid(radius, speed);
    asteroid.position.set(
        bounds.left + random() * (bounds.right - bounds.left),
        bounds.top - radius - 20,
    );
    return asteroid;
}
