import { Container } from 'pixi.js';
import { prop, scene, slot } from 'pixifact/compiler';
import { Control } from './Control';
import { measureChildren, type Size } from './controlLayout';

export type FlexAlignSelf = 'auto' | 'start' | 'center' | 'end' | 'stretch';
export type FlexBasis = number | 'auto';

export interface FlexItemLayoutProps {
    grow: number;
    shrink: number;
    basis: FlexBasis;
    minWidth: number;
    minHeight: number;
    maxWidth: number;
    maxHeight: number;
    marginLeft: number;
    marginRight: number;
    marginTop: number;
    marginBottom: number;
    alignSelf: FlexAlignSelf;
}

@scene()
export class FlexItem extends Control {
    @slot()
    declare readonly default: Container;

    #grow = 0;
    #shrink = 1;
    #basis: FlexBasis = 'auto';
    #maxWidth = -1;
    #maxHeight = -1;
    #marginLeft = 0;
    #marginRight = 0;
    #marginTop = 0;
    #marginBottom = 0;
    #alignSelf: FlexAlignSelf = 'auto';

    get grow() {
        return this.#grow;
    }

    @prop({ type: Number, default: 0 })
    set grow(value: number) {
        this.#grow = Math.max(0, finiteNumber(value, 0));
        this.requestParentLayout();
    }

    get shrink() {
        return this.#shrink;
    }

    @prop({ type: Number, default: 1 })
    set shrink(value: number) {
        this.#shrink = Math.max(0, finiteNumber(value, 1));
        this.requestParentLayout();
    }

    get basis() {
        return this.#basis;
    }

    @prop({ type: Number, default: -1 })
    set basis(value: string | number) {
        this.#basis = parseBasis(value);
        this.requestParentLayout();
    }

    get maxWidth() {
        return this.#maxWidth;
    }

    @prop({ type: Number, default: -1 })
    set maxWidth(value: number) {
        this.#maxWidth = finiteNumber(value, -1);
        this.requestParentLayout();
    }

    get maxHeight() {
        return this.#maxHeight;
    }

    @prop({ type: Number, default: -1 })
    set maxHeight(value: number) {
        this.#maxHeight = finiteNumber(value, -1);
        this.requestParentLayout();
    }

    get marginLeft() {
        return this.#marginLeft;
    }

    @prop({ type: Number, default: 0 })
    set marginLeft(value: number) {
        this.#marginLeft = finiteNumber(value, 0);
        this.requestParentLayout();
    }

    get marginRight() {
        return this.#marginRight;
    }

    @prop({ type: Number, default: 0 })
    set marginRight(value: number) {
        this.#marginRight = finiteNumber(value, 0);
        this.requestParentLayout();
    }

    get marginTop() {
        return this.#marginTop;
    }

    @prop({ type: Number, default: 0 })
    set marginTop(value: number) {
        this.#marginTop = finiteNumber(value, 0);
        this.requestParentLayout();
    }

    get marginBottom() {
        return this.#marginBottom;
    }

    @prop({ type: Number, default: 0 })
    set marginBottom(value: number) {
        this.#marginBottom = finiteNumber(value, 0);
        this.requestParentLayout();
    }

    get alignSelf() {
        return this.#alignSelf;
    }

    @prop({ type: String, default: 'auto' })
    set alignSelf(value: string) {
        this.#alignSelf = parseAlignSelf(value);
        this.requestParentLayout();
    }

    getFlexItemLayoutProps(): FlexItemLayoutProps {
        const controlProps = this.getControlLayoutProps();
        return {
            grow: this.#grow,
            shrink: this.#shrink,
            basis: this.#basis,
            minWidth: controlProps.minWidth,
            minHeight: controlProps.minHeight,
            maxWidth: this.#maxWidth,
            maxHeight: this.#maxHeight,
            marginLeft: this.#marginLeft,
            marginRight: this.#marginRight,
            marginTop: this.#marginTop,
            marginBottom: this.#marginBottom,
            alignSelf: this.#alignSelf,
        };
    }

    override measureControlNaturalSize(): Size {
        return measureChildren(this.default ?? this);
    }
}

function parseBasis(value: string | number): FlexBasis {
    if (value === 'auto') {
        return 'auto';
    }
    const basis = finiteNumber(Number(value), -1);
    return basis >= 0 ? basis : 'auto';
}

function parseAlignSelf(value: string): FlexAlignSelf {
    if (value === 'start' || value === 'center' || value === 'end' || value === 'stretch') {
        return value;
    }
    return 'auto';
}

function finiteNumber(value: number, fallback: number) {
    return Number.isFinite(value) ? value : fallback;
}
