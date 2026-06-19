import { Container } from 'pixi.js';
import { prop, scene, slot } from 'pixifact/compiler';
import { Control } from './Control';

export type FlexAxis = 'row' | 'column';
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

    #boxWidth: number | undefined;
    #boxHeight: number | undefined;
    #grow = 0;
    #shrink = 1;
    #basis: FlexBasis = 'auto';
    #minWidth = 0;
    #minHeight = 0;
    #maxWidth = -1;
    #maxHeight = -1;
    #marginLeft = 0;
    #marginRight = 0;
    #marginTop = 0;
    #marginBottom = 0;
    #alignSelf: FlexAlignSelf = 'auto';

    override get width() {
        return this.#boxWidth ?? this.measureFlexNaturalSize('row');
    }

    override set width(value: number) {
        this.#boxWidth = finiteNumber(value, 0);
        this.#syncBoxSize();
        this.requestParentLayout();
    }

    override get height() {
        return this.#boxHeight ?? this.measureFlexNaturalSize('column');
    }

    override set height(value: number) {
        this.#boxHeight = finiteNumber(value, 0);
        this.#syncBoxSize();
        this.requestParentLayout();
    }

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

    get minWidth() {
        return this.#minWidth;
    }

    @prop({ type: Number, default: 0 })
    set minWidth(value: number) {
        this.#minWidth = Math.max(0, finiteNumber(value, 0));
        this.requestParentLayout();
    }

    get minHeight() {
        return this.#minHeight;
    }

    @prop({ type: Number, default: 0 })
    set minHeight(value: number) {
        this.#minHeight = Math.max(0, finiteNumber(value, 0));
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
        return {
            grow: this.#grow,
            shrink: this.#shrink,
            basis: this.#basis,
            minWidth: this.#minWidth,
            minHeight: this.#minHeight,
            maxWidth: this.#maxWidth,
            maxHeight: this.#maxHeight,
            marginLeft: this.#marginLeft,
            marginRight: this.#marginRight,
            marginTop: this.#marginTop,
            marginBottom: this.#marginBottom,
            alignSelf: this.#alignSelf,
        };
    }

    measureFlexNaturalSize(axis: FlexAxis) {
        const size = measureChildren(this.default ?? this);
        return axis === 'row' ? size.width : size.height;
    }

    setFlexLayoutBox(x: number, y: number, width: number, height: number) {
        this.position.set(x, y);
        this.#boxWidth = width;
        this.#boxHeight = height;
        this.#syncBoxSize();
    }

    #syncBoxSize() {
        this.syncBoxSize(
            this.#boxWidth ?? this.measureFlexNaturalSize('row'),
            this.#boxHeight ?? this.measureFlexNaturalSize('column'),
        );
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

function measureChildren(container: Container) {
    let maxX = 0;
    let maxY = 0;
    for (const child of container.children) {
        maxX = Math.max(maxX, child.x + child.width);
        maxY = Math.max(maxY, child.y + child.height);
    }
    return { width: maxX, height: maxY };
}

function finiteNumber(value: number, fallback: number) {
    return Number.isFinite(value) ? value : fallback;
}
