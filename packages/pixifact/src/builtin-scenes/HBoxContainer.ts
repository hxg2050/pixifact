import { Container } from 'pixi.js';
import { prop, scene, slot } from 'pixifact/compiler';
import { Control } from './Control';
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
export class HBoxContainer extends Control {
    @slot()
    declare readonly default: Container;

    #gap = 0;
    #alignY: ControlAlign = 'start';
    #justify: ControlJustify = 'start';
    #baseSizes = new WeakMap<object, Size>();

    get gap() {
        return this.#gap;
    }

    @prop({ type: Number, default: 0 })
    set gap(value: number) {
        this.#gap = Math.max(0, finiteNumber(value, 0));
        this.refreshControlLayout();
    }

    get alignY() {
        return this.#alignY;
    }

    @prop({ type: String, default: 'start' })
    set alignY(value: string) {
        this.#alignY = parseAlign(value);
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

    override layout() {
        this.syncControlBoxSize();
        const assigned = this.getAssignedControlBoxSize();
        layoutStack({
            axis: 'horizontal',
            children: this.default?.children as ControlLayoutChild[] | undefined,
            gap: this.#gap,
            alignCross: this.#alignY,
            justify: this.#justify,
            baseSizes: this.#baseSizes,
            width: assigned.width,
            height: assigned.height,
            naturalSize: () => this.measureControlNaturalSize(),
        });
    }

    override measureControlNaturalSize(): Size {
        return measureStackNaturalSize('horizontal', this.default?.children as ControlLayoutChild[] | undefined, this.#gap, this.#baseSizes);
    }
}
