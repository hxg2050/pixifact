import {
    Container,
    MeshRope,
    Point,
    Ticker,
    type DestroyOptions,
    type RopeGeometry,
    type Texture,
} from 'pixi.js';

export interface TrailEffectOptions {
    texture: Texture;
    lifetime: number;
    maxPoints: number;
    minDistance: number;
    width: number;
    startAlpha: number;
    endAlpha: number;
    color?: number;
    blendMode?: 'normal' | 'add';
}

export interface TrailSampleSnapshot {
    readonly x: number;
    readonly y: number;
    readonly age: number;
}

interface TrailSample {
    x: number;
    y: number;
    age: number;
}

export class TrailEffect extends Container {
    readonly rope: MeshRope;

    #options: TrailEffectOptions;
    #ticker: Ticker;
    #samples: Array<TrailSample | undefined>;
    #points: Point[];
    #sampleStart = 0;
    #sampleCount = 0;
    #target: Container | undefined;
    #lastSamplePosition = new Point();
    #globalPosition = new Point();
    #localPosition = new Point();
    #timeSinceSample = 0;
    #running = false;

    constructor(options: TrailEffectOptions, ticker: Ticker = Ticker.shared) {
        super({ label: 'TrailEffect' });
        this.#options = options;
        this.#ticker = ticker;
        this.#samples = new Array(options.maxPoints);
        this.#points = Array.from({ length: options.maxPoints }, () => new Point());
        this.rope = new MeshRope({
            texture: options.texture,
            points: this.#points,
            width: options.width,
        });
        this.rope.autoUpdate = false;
        this.rope.tint = options.color ?? 0xffffff;
        this.rope.blendMode = options.blendMode ?? 'normal';
        this.rope.visible = false;
        this.addChild(this.rope);
    }

    get isRunning() {
        return this.#running;
    }

    get pointCount() {
        return this.#sampleCount;
    }

    get hasTarget() {
        return this.#target !== undefined;
    }

    attach(target: Container) {
        this.#detachTarget();
        this.#target = target;
        target.on('destroyed', this.#handleTargetDestroyed, this);
        this.#clearSamples();
        const position = this.#readTargetPosition();
        this.#lastSamplePosition.set(position.x, position.y);
        this.#appendSample(position.x, position.y, 0);
        this.#timeSinceSample = 0;
        this.#syncRope();
    }

    start() {
        if (this.#running) {
            return;
        }
        this.#running = true;
        this.#ticker.add(this.#handleTick, this);
    }

    stop() {
        if (!this.#running) {
            return;
        }
        this.#ticker.remove(this.#handleTick, this);
        this.#running = false;
    }

    getSamples(): TrailSampleSnapshot[] {
        return Array.from({ length: this.#sampleCount }, (_, index) => {
            const sample = this.#sampleAt(index);
            return { x: sample.x, y: sample.y, age: sample.age };
        });
    }

    override destroy(options?: DestroyOptions) {
        this.stop();
        this.#detachTarget();
        this.#clearSamples();
        this.rope.destroy();
        super.destroy(options);
    }

    #handleTick = (ticker: Ticker) => {
        if (!this.#running || this.destroyed || !this.#target) {
            return;
        }

        const deltaMS = ticker.deltaMS;
        this.#timeSinceSample += deltaMS;
        for (let index = 0; index < this.#sampleCount; index += 1) {
            this.#sampleAt(index).age += deltaMS;
        }

        const position = this.#readTargetPosition();
        const distance = Math.hypot(
            position.x - this.#lastSamplePosition.x,
            position.y - this.#lastSamplePosition.y,
        );
        if (distance >= this.#options.minDistance) {
            const segmentCount = Math.ceil(distance / this.#options.minDistance);
            for (let segment = 1; segment <= segmentCount; segment += 1) {
                const ratio = segment / segmentCount;
                this.#appendSample(
                    this.#lastSamplePosition.x + (position.x - this.#lastSamplePosition.x) * ratio,
                    this.#lastSamplePosition.y + (position.y - this.#lastSamplePosition.y) * ratio,
                    this.#timeSinceSample * (1 - ratio),
                );
            }
            this.#lastSamplePosition.set(position.x, position.y);
            this.#timeSinceSample = 0;
        }

        this.#removeExpiredSamples();
        this.#syncRope();
    };

    #readTargetPosition() {
        const global = this.#target!.getGlobalPosition(this.#globalPosition);
        return this.toLocal(global, undefined, this.#localPosition);
    }

    #appendSample(x: number, y: number, age: number) {
        const index = this.#sampleCount === this.#samples.length
            ? this.#sampleStart
            : (this.#sampleStart + this.#sampleCount) % this.#samples.length;
        if (this.#sampleCount === this.#samples.length) {
            this.#sampleStart = (this.#sampleStart + 1) % this.#samples.length;
        } else {
            this.#sampleCount += 1;
        }
        this.#samples[index] = { x, y, age };
    }

    #removeExpiredSamples() {
        while (this.#sampleCount > 0 && this.#sampleAt(0).age >= this.#options.lifetime) {
            this.#samples[this.#sampleStart] = undefined;
            this.#sampleStart = (this.#sampleStart + 1) % this.#samples.length;
            this.#sampleCount -= 1;
        }
    }

    #syncRope() {
        const first = this.#sampleCount > 0 ? this.#sampleAt(0) : undefined;
        const last = this.#sampleCount > 0 ? this.#sampleAt(this.#sampleCount - 1) : first;
        for (let index = 0; index < this.#points.length; index += 1) {
            const sample = index < this.#sampleCount ? this.#sampleAt(index) : last;
            this.#points[index].set(sample?.x ?? 0, sample?.y ?? 0);
        }
        this.rope.visible = this.#sampleCount > 1;
        this.rope.alpha = this.#ropeAlpha();
        (this.rope.geometry as RopeGeometry).update();
    }

    #ropeAlpha() {
        if (this.#sampleCount === 0) {
            return this.#options.endAlpha;
        }
        const oldest = this.#sampleAt(0).age;
        const progress = Math.min(1, oldest / this.#options.lifetime);
        return this.#options.startAlpha + (this.#options.endAlpha - this.#options.startAlpha) * progress;
    }

    #sampleAt(index: number) {
        return this.#samples[(this.#sampleStart + index) % this.#samples.length]!;
    }

    #clearSamples() {
        this.#samples.fill(undefined);
        this.#sampleStart = 0;
        this.#sampleCount = 0;
    }

    #detachTarget() {
        if (!this.#target) {
            return;
        }
        this.#target.off('destroyed', this.#handleTargetDestroyed, this);
        this.#target = undefined;
    }

    #handleTargetDestroyed = () => {
        this.stop();
        this.#detachTarget();
        this.#clearSamples();
        this.#syncRope();
    };
}
