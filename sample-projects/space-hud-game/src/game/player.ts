import { Container, Graphics } from 'pixi.js';
import type { InputState } from './input';
import { computeDesignBounds, DESIGN_HEIGHT, DESIGN_WIDTH } from './viewport';

export class PlayerShip extends Container {
    readonly radius = 28;
    readonly speed = 480;

    constructor() {
        super();

        const hull = new Graphics()
            .moveTo(0, -34)
            .lineTo(26, 30)
            .lineTo(0, 18)
            .lineTo(-26, 30)
            .closePath()
            .fill(0xf8fafc)
            .stroke({ width: 4, color: 0x38bdf8 });
        const cockpit = new Graphics()
            .ellipse(0, -8, 9, 17)
            .fill(0x22d3ee);
        const flame = new Graphics()
            .moveTo(-10, 30)
            .lineTo(0, 56)
            .lineTo(10, 30)
            .closePath()
            .fill(0xf97316);

        this.addChild(flame, hull, cockpit);
    }

    reset() {
        this.position.set(
            DESIGN_WIDTH / 2,
            DESIGN_HEIGHT - 250,
        );
    }

    update(input: InputState, deltaSeconds: number) {
        const horizontal = Number(input.right) - Number(input.left);
        const vertical = Number(input.down) - Number(input.up);
        this.x += horizontal * this.speed * deltaSeconds;
        this.y += vertical * this.speed * deltaSeconds;

        const bounds = computeDesignBounds();
        this.x = Math.max(bounds.left, Math.min(bounds.right, this.x));
        this.y = Math.max(bounds.top, Math.min(bounds.bottom, this.y));
    }
}
