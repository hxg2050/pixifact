import { Container } from 'pixi.js';
import { prop, scene, slot } from 'pixifact/compiler';
import {
    finiteNumber,
    layoutStack,
    measureStackNaturalSize,
    parseAlign,
    parseJustify,
    type ControlAlign,
    type ControlJustify,
    type ControlLayoutChild,
    type Size,
} from './controlLayout';

@scene()
export class VBoxContainer extends Container {
    @slot()
    readonly default!: Container;

    #gap = 0;
    #alignX: ControlAlign = 'start';
    #justify: ControlJustify = 'start';
    #explicitWidth: number | undefined;
    #explicitHeight: number | undefined;
    #layoutWidth: number | undefined;
    #layoutHeight: number | undefined;
    #baseSizes = new WeakMap<object, Size>();

    override get width() {
        return this.#layoutWidth ?? this.#explicitWidth ?? this.measureControlNaturalSize().width;
    }

    override set width(value: number) {
        this.#explicitWidth = Math.max(0, finiteNumber(value, 0));
        this.layout();
    }

    override get height() {
        return this.#layoutHeight ?? this.#explicitHeight ?? this.measureControlNaturalSize().height;
    }

    override set height(value: number) {
        this.#explicitHeight = Math.max(0, finiteNumber(value, 0));
        this.layout();
    }

    get gap() {
        return this.#gap;
    }

    @prop({ type: Number, default: 0 })
    set gap(value: number) {
        this.#gap = Math.max(0, finiteNumber(value, 0));
        this.layout();
    }

    get alignX() {
        return this.#alignX;
    }

    @prop({ type: String, default: 'start' })
    set alignX(value: string) {
        this.#alignX = parseAlign(value);
        this.layout();
    }

    get justify() {
        return this.#justify;
    }

    @prop({ type: String, default: 'start' })
    set justify(value: string) {
        this.#justify = parseJustify(value);
        this.layout();
    }

    onMounted() {
        this.default.on('childAdded', this.layout, this);
        this.default.on('childRemoved', this.layout, this);
        this.once('destroyed', this.unmountLayout, this);
        this.layout();
    }

    private unmountLayout() {
        this.default.off('childAdded', this.layout, this);
        this.default.off('childRemoved', this.layout, this);
    }

    layout() {
        layoutStack({
            axis: 'vertical',
            children: this.default?.children as ControlLayoutChild[] | undefined,
            gap: this.#gap,
            alignCross: this.#alignX,
            justify: this.#justify,
            baseSizes: this.#baseSizes,
            width: this.#layoutWidth ?? this.#explicitWidth,
            height: this.#layoutHeight ?? this.#explicitHeight,
            naturalSize: () => this.measureControlNaturalSize(),
        });
    }

    measureControlNaturalSize(): Size {
        return measureStackNaturalSize('vertical', this.default?.children as ControlLayoutChild[] | undefined, this.#gap, this.#baseSizes);
    }

    setControlLayoutBox(x: number, y: number, width: number, height: number) {
        this.position.set(x, y);
        this.#layoutWidth = Math.max(0, width);
        this.#layoutHeight = Math.max(0, height);
        this.layout();
    }
}
