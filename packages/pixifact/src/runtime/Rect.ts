import { Graphics, Rectangle, type GraphicsOptions, type Size } from 'pixi.js';
import {
    getFrameLayout,
    setFrameLayout,
    type FrameLayoutProp,
} from './frameLayout';

export type RectOptions = GraphicsOptions & {
    width?: number;
    height?: number;
    fillColor?: number;
    fillAlpha?: number;
    strokeColor?: number;
    strokeAlpha?: number;
    strokeWidth?: number;
    radius?: number;
};

export class Rect extends Graphics {
    #width = 100;
    #height = 60;
    #fillColor = 0xffffff;
    #fillAlpha = 1;
    #strokeColor = 0x000000;
    #strokeAlpha = 1;
    #strokeWidth = 0;
    #radius = 0;

    constructor(options: RectOptions = {}) {
        const {
            width,
            height,
            fillColor,
            fillAlpha,
            strokeColor,
            strokeAlpha,
            strokeWidth,
            radius,
            ...graphicsOptions
        } = options;
        super(graphicsOptions);

        this.#width = width ?? this.#width;
        this.#height = height ?? this.#height;
        this.#fillColor = fillColor ?? this.#fillColor;
        this.#fillAlpha = fillAlpha ?? this.#fillAlpha;
        this.#strokeColor = strokeColor ?? this.#strokeColor;
        this.#strokeAlpha = strokeAlpha ?? this.#strokeAlpha;
        this.#strokeWidth = strokeWidth ?? this.#strokeWidth;
        this.#radius = radius ?? this.#radius;
        this.#syncHitArea();
        this.#redraw();
    }

    override get width() {
        return this.#width;
    }

    override set width(value: number) {
        this.#setBoxSize(value, this.#height);
    }

    override get height() {
        return this.#height;
    }

    override set height(value: number) {
        this.#setBoxSize(this.#width, value);
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
    }

    get fillColor() {
        return this.#fillColor;
    }

    set fillColor(value: number) {
        this.#fillColor = value;
        this.#redraw();
    }

    get fillAlpha() {
        return this.#fillAlpha;
    }

    set fillAlpha(value: number) {
        this.#fillAlpha = value;
        this.#redraw();
    }

    get strokeColor() {
        return this.#strokeColor;
    }

    set strokeColor(value: number) {
        this.#strokeColor = value;
        this.#redraw();
    }

    get strokeAlpha() {
        return this.#strokeAlpha;
    }

    set strokeAlpha(value: number) {
        this.#strokeAlpha = value;
        this.#redraw();
    }

    get strokeWidth() {
        return this.#strokeWidth;
    }

    set strokeWidth(value: number) {
        this.#strokeWidth = value;
        this.#redraw();
    }

    get radius() {
        return this.#radius;
    }

    set radius(value: number) {
        this.#radius = value;
        this.#redraw();
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
        return getFrameLayout(this)[prop];
    }

    #setLayoutProp(prop: FrameLayoutProp, value: number | undefined) {
        setFrameLayout(this, { [prop]: value });
    }

    #setBoxSize(width: number, height: number) {
        this.#width = width;
        this.#height = height;
        this.#syncHitArea();
        this.#redraw();
    }

    #syncHitArea() {
        const bounds = new Rectangle(0, 0, this.#width, this.#height);
        this.hitArea = bounds;
        this.boundsArea = bounds;
    }

    #redraw() {
        this.clear();
        const radius = Math.max(0, Math.min(this.#radius, this.#width / 2, this.#height / 2));
        const shape = radius > 0
            ? this.roundRect(0, 0, this.#width, this.#height, radius)
            : this.rect(0, 0, this.#width, this.#height);
        shape.fill({ color: this.#fillColor, alpha: this.#fillAlpha });
        if (this.#strokeWidth > 0) {
            shape.stroke({
                width: this.#strokeWidth,
                color: this.#strokeColor,
                alpha: this.#strokeAlpha,
                alignment: 1,
            });
        }
    }
}
