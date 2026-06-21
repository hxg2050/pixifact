import { NineSliceSprite, Texture, type NineSliceSpriteOptions } from 'pixi.js';
import { frameLayoutProp, setFrameLayoutProp } from './frameLayoutAccessors';
import type { FrameLayoutProp } from './frameLayout';

export type NineImageOptions = Omit<NineSliceSpriteOptions, 'texture' | 'anchor'> & {
    texture?: Texture;
    anchorX?: number;
    anchorY?: number;
};

export class NineImage extends NineSliceSprite {
    constructor(options: NineImageOptions = {}) {
        const {
            texture,
            anchorX,
            anchorY,
            ...spriteOptions
        } = options;
        super({
            texture: texture ?? Texture.EMPTY,
            ...spriteOptions,
        });
        this.anchor.set(anchorX ?? 0, anchorY ?? 0);
    }

    get left() {
        return this.#layoutProp('left');
    }

    set left(value: number | undefined) {
        this.#setLayoutProp('left', value);
    }

    get right() {
        return this.#layoutProp('right');
    }

    set right(value: number | undefined) {
        this.#setLayoutProp('right', value);
    }

    get top() {
        return this.#layoutProp('top');
    }

    set top(value: number | undefined) {
        this.#setLayoutProp('top', value);
    }

    get bottom() {
        return this.#layoutProp('bottom');
    }

    set bottom(value: number | undefined) {
        this.#setLayoutProp('bottom', value);
    }

    get horizontal() {
        return this.#layoutProp('horizontal');
    }

    set horizontal(value: number | undefined) {
        this.#setLayoutProp('horizontal', value);
    }

    get vertical() {
        return this.#layoutProp('vertical');
    }

    set vertical(value: number | undefined) {
        this.#setLayoutProp('vertical', value);
    }

    #layoutProp(prop: FrameLayoutProp) {
        return frameLayoutProp(this, prop);
    }

    #setLayoutProp(prop: FrameLayoutProp, value: number | undefined) {
        setFrameLayoutProp(this, prop, value);
    }
}
