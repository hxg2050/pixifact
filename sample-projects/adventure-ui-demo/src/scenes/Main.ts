import { Graphics, Ticker, type DestroyOptions, type Texture } from 'pixi.js';
import { Group } from 'pixifact/runtime';
import { part, scene } from 'pixifact/scene';
import type { BottomMenu } from './BottomMenu';
import type { InventoryPanel } from './InventoryPanel';
import { TrailEffect } from '../effects/TrailEffect';

@scene()
export class Main extends Group {
    @part()
    protected declare inventoryPanel: InventoryPanel;

    @part()
    protected declare bottomMenu: BottomMenu;

    @part()
    protected declare trailLayer: Group;

    #trailTicker: Ticker | undefined;
    #trailEffect: TrailEffect | undefined;
    #trailProbe: Graphics | undefined;

    toggleInventory() {
        this.inventoryPanel.visible = !this.inventoryPanel.visible;
    }

    setupTrailDemo(ticker: Ticker, texture: Texture) {
        if (this.#trailTicker) {
            return;
        }

        const trail = new TrailEffect({
            texture,
            lifetime: 620,
            maxPoints: 28,
            minDistance: 18,
            width: 34,
            startAlpha: 0.9,
            endAlpha: 0.12,
            color: 0x8ce7ff,
            blendMode: 'add',
        }, ticker);
        const probe = new Graphics()
            .circle(0, 0, 24)
            .fill({ color: 0x132b46, alpha: 0.96 })
            .stroke({ color: 0xa4efff, alpha: 0.95, width: 3 })
            .circle(0, 0, 8)
            .fill({ color: 0xf8ffff, alpha: 1 });
        this.trailLayer.addChild(trail, probe);
        trail.attach(probe);
        ticker.add(this.#updateTrailDemo, this);
        trail.start();
        this.#trailTicker = ticker;
        this.#trailEffect = trail;
        this.#trailProbe = probe;
    }

    override destroy(options?: DestroyOptions) {
        this.#trailTicker?.remove(this.#updateTrailDemo, this);
        this.#trailEffect?.destroy();
        this.#trailProbe?.destroy();
        this.#trailTicker = undefined;
        this.#trailEffect = undefined;
        this.#trailProbe = undefined;
        super.destroy(options);
    }

    #updateTrailDemo(ticker: Ticker) {
        if (!this.#trailProbe) {
            return;
        }
        const time = ticker.lastTime / 1000;
        this.#trailProbe.position.set(
            375 + Math.cos(time * 1.15) * 230,
            405 + Math.sin(time * 1.7) * 210,
        );
    }

    getRuntimeState() {
        return {
            inventoryOpen: this.inventoryPanel.visible,
        };
    }
}
