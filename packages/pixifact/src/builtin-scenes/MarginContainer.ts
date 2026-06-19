import { Container } from 'pixi.js';
import { prop, scene, slot } from 'pixifact/compiler';
import { Control } from './Control';
import {
    alignOffset,
    controlChildProps,
    controlMinSize,
    fillOrExpand,
    finiteNumber,
    parseAlign,
    setControlChildBox,
    type ControlAlign,
    type ControlLayoutChild,
    type Size,
} from './controlLayout';

@scene()
export class MarginContainer extends Control {
    @slot()
    declare readonly default: Container;

    #margin = 0;
    #marginLeft: number | undefined;
    #marginRight: number | undefined;
    #marginTop: number | undefined;
    #marginBottom: number | undefined;
    #alignX: ControlAlign = 'start';
    #alignY: ControlAlign = 'start';
    #baseSizes = new WeakMap<object, Size>();

    get margin() {
        return this.#margin;
    }

    @prop({ type: Number, default: 0 })
    set margin(value: number) {
        this.#margin = Math.max(0, finiteNumber(value, 0));
        this.refreshControlLayout();
    }

    get marginLeft() {
        return this.#marginLeft ?? this.#margin;
    }

    @prop({ type: Number })
    set marginLeft(value: number) {
        this.#marginLeft = Math.max(0, finiteNumber(value, 0));
        this.refreshControlLayout();
    }

    get marginRight() {
        return this.#marginRight ?? this.#margin;
    }

    @prop({ type: Number })
    set marginRight(value: number) {
        this.#marginRight = Math.max(0, finiteNumber(value, 0));
        this.refreshControlLayout();
    }

    get marginTop() {
        return this.#marginTop ?? this.#margin;
    }

    @prop({ type: Number })
    set marginTop(value: number) {
        this.#marginTop = Math.max(0, finiteNumber(value, 0));
        this.refreshControlLayout();
    }

    get marginBottom() {
        return this.#marginBottom ?? this.#margin;
    }

    @prop({ type: Number })
    set marginBottom(value: number) {
        this.#marginBottom = Math.max(0, finiteNumber(value, 0));
        this.refreshControlLayout();
    }

    get alignX() {
        return this.#alignX;
    }

    @prop({ type: String, default: 'start' })
    set alignX(value: string) {
        this.#alignX = parseAlign(value);
        this.layout();
    }

    get alignY() {
        return this.#alignY;
    }

    @prop({ type: String, default: 'start' })
    set alignY(value: string) {
        this.#alignY = parseAlign(value);
        this.layout();
    }

    override layout() {
        const size = this.syncControlBoxSize();
        const children = this.default?.children as ControlLayoutChild[] | undefined;
        if (!children || children.length === 0) {
            return;
        }

        const innerWidth = Math.max(0, size.width - this.marginLeft - this.marginRight);
        const innerHeight = Math.max(0, size.height - this.marginTop - this.marginBottom);

        for (const child of children) {
            const props = controlChildProps(child);
            const childSize = controlMinSize(child, this.#baseSizes);
            const childWidth = fillOrExpand(props.hSize) ? innerWidth : childSize.width;
            const childHeight = fillOrExpand(props.vSize) ? innerHeight : childSize.height;
            setControlChildBox(child, {
                x: this.marginLeft + alignOffset(this.#alignX, Math.max(0, innerWidth - childWidth)),
                y: this.marginTop + alignOffset(this.#alignY, Math.max(0, innerHeight - childHeight)),
                width: childWidth,
                height: childHeight,
            });
        }
    }

    override measureControlNaturalSize(): Size {
        const children = this.default?.children as ControlLayoutChild[] | undefined;
        if (!children || children.length === 0) {
            return {
                width: this.marginLeft + this.marginRight,
                height: this.marginTop + this.marginBottom,
            };
        }
        const sizes = children.map((child) => controlMinSize(child, this.#baseSizes));
        return {
            width: this.marginLeft + this.marginRight + sizes.reduce((max, size) => Math.max(max, size.width), 0),
            height: this.marginTop + this.marginBottom + sizes.reduce((max, size) => Math.max(max, size.height), 0),
        };
    }
}
