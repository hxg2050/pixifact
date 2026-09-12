import { afterEach, describe, expect, it } from 'vitest';
import { Container, Texture, type Ticker } from 'pixi.js';
import { TrailEffect, type TrailEffectOptions } from '../sample-projects/adventure-ui-demo/src/effects/TrailEffect';

type Listener = (ticker: Ticker) => void;

class TestTicker {
    readonly listeners = new Map<Listener, unknown>();

    add(listener: Listener, context?: unknown) {
        this.listeners.set(listener, context);
    }

    remove(listener: Listener, context?: unknown) {
        if (this.listeners.get(listener) === context) {
            this.listeners.delete(listener);
        }
    }

    tick(deltaMS: number) {
        const frame = { deltaMS } as Ticker;
        for (const [listener, context] of this.listeners) {
            listener.call(context, frame);
        }
    }
}

const defaultOptions: TrailEffectOptions = {
    texture: Texture.WHITE,
    lifetime: 1000,
    maxPoints: 8,
    minDistance: 10,
    width: 12,
    startAlpha: 1,
    endAlpha: 0,
};

const effects: TrailEffect[] = [];

afterEach(() => {
    for (const effect of effects.splice(0)) {
        if (!effect.destroyed) {
            effect.destroy();
        }
    }
});

function createTrail(overrides: Partial<TrailEffectOptions> = {}) {
    const ticker = new TestTicker();
    const parent = new Container({ x: 100, y: 50 });
    const effect = new TrailEffect({ ...defaultOptions, ...overrides }, ticker as unknown as Ticker);
    const target = new Container({ x: 30, y: 40 });
    effect.position.set(10, 20);
    parent.addChild(effect, target);
    effect.attach(target);
    effects.push(effect);
    return { effect, parent, target, ticker };
}

describe('TrailEffect', () => {
    it('samples the target in the effect container local space', () => {
        const { effect } = createTrail();

        expect(effect.getSamples()).toEqual([{ x: 20, y: 20, age: 0 }]);
    });

    it('waits for the minimum distance and inserts interpolated points', () => {
        const { effect, target, ticker } = createTrail();
        effect.start();

        target.position.x = 35;
        ticker.tick(16);
        expect(effect.pointCount).toBe(1);

        target.position.x = 50;
        ticker.tick(16);
        expect(effect.getSamples().map(({ x }) => x)).toEqual([20, 30, 40]);
    });

    it('keeps the newest samples when the ring buffer reaches capacity', () => {
        const { effect, target, ticker } = createTrail({ maxPoints: 3 });
        effect.start();

        for (const x of [40, 50, 60]) {
            target.position.x = x;
            ticker.tick(16);
        }

        expect(effect.pointCount).toBe(3);
        expect(effect.getSamples().map(({ x }) => x)).toEqual([30, 40, 50]);
    });

    it('removes samples after their lifetime', () => {
        const { effect, ticker } = createTrail({ lifetime: 50 });
        effect.start();

        ticker.tick(50);

        expect(effect.pointCount).toBe(0);
        expect(effect.rope.visible).toBe(false);
    });

    it('does not update after stop and removes its ticker listener on destroy', () => {
        const { effect, target, ticker } = createTrail();
        effect.start();
        expect(ticker.listeners.size).toBe(1);

        effect.stop();
        target.position.x = 80;
        ticker.tick(16);
        expect(effect.pointCount).toBe(1);

        effect.start();
        expect(ticker.listeners.size).toBe(1);
        effect.destroy();
        expect(ticker.listeners.size).toBe(0);
        expect(effect.rope.destroyed).toBe(true);
    });

    it('stops and clears samples when the target is destroyed', () => {
        const { effect, target, ticker } = createTrail();
        effect.start();

        target.destroy();

        expect(effect.isRunning).toBe(false);
        expect(effect.hasTarget).toBe(false);
        expect(effect.pointCount).toBe(0);
        expect(ticker.listeners.size).toBe(0);
    });
});
