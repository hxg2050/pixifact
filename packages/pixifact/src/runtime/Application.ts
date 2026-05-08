import * as PIXI from 'pixi.js';
import type { Ticker, RendererDestroyOptions, DestroyOptions } from 'pixi.js';
import { UPDATE_PRIORITY } from 'pixi.js';
import { GameObject } from './GameObject';
import { Group } from './group';
export class Application extends PIXI.Application {
    root!: Group;
    private updateTargets = new Set<GameObject>();
    private isUpdateTickerRegistered = false;

    private updateGameObjects = (ticker: Ticker) => {
        const dt = ticker.deltaTime;

        for (const target of [...this.updateTargets]) {
            if (target.app !== this || !target.hasUpdateWork()) {
                this.unregisterUpdateTarget(target);
                continue;
            }

            target.emitter.emit(GameObject.Event.TICKER_BEFORE, dt);
            target.update?.(dt);
            target.emitter.emit(GameObject.Event.TICKER_AFTER, dt);
        }
    };

    public async init(options?: Partial<PIXI.ApplicationOptions>) {
        await super.init(options);

        this.root = new Group();
        this.root.display = this.stage;
        this.root.width = this.screen.width
        this.root.height = this.screen.height;
        this.root.setApplication(this);
    }

    public registerUpdateTarget(target: GameObject) {
        if (target.app !== this || !target.hasUpdateWork()) {
            return;
        }

        this.updateTargets.add(target);
        this.syncUpdateTicker();
    }

    public unregisterUpdateTarget(target: GameObject) {
        if (!this.updateTargets.delete(target)) {
            return;
        }

        this.syncUpdateTicker();
    }

    private syncUpdateTicker() {
        if (!this.ticker) {
            return;
        }

        if (this.updateTargets.size > 0) {
            if (!this.isUpdateTickerRegistered) {
                this.ticker.add(this.updateGameObjects, undefined, UPDATE_PRIORITY.NORMAL);
                this.isUpdateTickerRegistered = true;
            }
            return;
        }

        if (this.isUpdateTickerRegistered) {
            this.ticker.remove(this.updateGameObjects);
            this.isUpdateTickerRegistered = false;
        }
    }

    public override destroy(
        rendererDestroyOptions?: RendererDestroyOptions,
        options?: DestroyOptions,
    ): void {
        this.updateTargets.clear();
        if (this.isUpdateTickerRegistered && this.ticker) {
            this.ticker.remove(this.updateGameObjects);
            this.isUpdateTickerRegistered = false;
        }
        this.root?.setApplication(undefined);
        super.destroy(rendererDestroyOptions, options);
    }
}
