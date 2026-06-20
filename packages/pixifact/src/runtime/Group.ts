import { Container, Rectangle, type ContainerOptions, type Size } from 'pixi.js';

export type GroupOptions = Omit<ContainerOptions, 'width' | 'height'> & {
    width?: number;
    height?: number;
};

export class Group extends Container {
    #width = 0;
    #height = 0;

    constructor(options: GroupOptions = {}) {
        const { width, height, ...containerOptions } = options;
        super(containerOptions);

        if (width !== undefined || height !== undefined) {
            this.setSize(width ?? 0, height ?? 0);
        }
    }

    override get width() {
        return this.#width;
    }

    override set width(value: number) {
        this.#width = value;
        this.#syncHitArea();
    }

    override get height() {
        return this.#height;
    }

    override set height(value: number) {
        this.#height = value;
        this.#syncHitArea();
    }

    override getSize(out: Size = { width: 0, height: 0 }) {
        out.width = this.#width;
        out.height = this.#height;
        return out;
    }

    override setSize(value: number | { width: number; height?: number }, height?: number) {
        if (typeof value === 'number') {
            this.#width = value;
            this.#height = height ?? value;
        } else {
            this.#width = value.width;
            this.#height = value.height ?? value.width;
        }
        this.#syncHitArea();
    }

    #syncHitArea() {
        const bounds = new Rectangle(0, 0, this.#width, this.#height);
        this.hitArea = bounds;
        this.boundsArea = bounds;
    }
}
