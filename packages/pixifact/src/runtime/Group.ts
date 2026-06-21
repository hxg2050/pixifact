import { Container, Rectangle, type ContainerOptions, type Size } from 'pixi.js';
import { layoutFrameChildren } from './frameLayout';

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
        this.on('childAdded', this.#layoutChildren, this);
        this.on('childRemoved', this.#layoutChildren, this);

        if (width !== undefined || height !== undefined) {
            this.#setBoxSize(width ?? 0, height ?? 0);
        }
    }

    override get width() {
        return this.#width;
    }

    override set width(value: number) {
        this.#setBoxSize(value, this.#height);
        this.layout();
    }

    override get height() {
        return this.#height;
    }

    override set height(value: number) {
        this.#setBoxSize(this.#width, value);
        this.layout();
    }

    override getSize(out: Size = { width: 0, height: 0 }) {
        out.width = this.#width;
        out.height = this.#height;
        return out;
    }

    override setSize(value: number | { width: number; height?: number }, height?: number) {
        if (typeof value === 'number') {
            this.#setBoxSize(value, height ?? value);
        } else {
            this.#setBoxSize(value.width, value.height ?? value.width);
        }
        this.layout();
    }

    layout() {
        this.#applyFrameLayout();
    }

    protected setBoxSize(width: number, height: number) {
        this.#setBoxSize(width, height);
    }

    #setBoxSize(width: number, height: number) {
        this.#width = width;
        this.#height = height;
        this.#syncHitArea();
    }

    #layoutChildren() {
        this.layout();
    }

    #applyFrameLayout() {
        layoutFrameChildren(this);
    }

    #syncHitArea() {
        const bounds = new Rectangle(0, 0, this.#width, this.#height);
        this.hitArea = bounds;
        this.boundsArea = bounds;
    }
}
