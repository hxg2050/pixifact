import { Container } from 'pixi.js';
import { prop, scene, slot } from 'pixifact/compiler';
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
export class MarginContainer extends Container {
    @slot()
    readonly default!: Container;

    #margin = 0;
    #marginLeft: number | undefined;
    #marginRight: number | undefined;
    #marginTop: number | undefined;
    #marginBottom: number | undefined;
    #alignX: ControlAlign = 'start';
    #alignY: ControlAlign = 'start';
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

    get margin() {
        return this.#margin;
    }

    @prop({ type: Number, default: 0 })
    set margin(value: number) {
        this.#margin = Math.max(0, finiteNumber(value, 0));
        this.layout();
    }

    get marginLeft() {
        return this.#marginLeft ?? this.#margin;
    }

    @prop({ type: Number })
    set marginLeft(value: number) {
        this.#marginLeft = Math.max(0, finiteNumber(value, 0));
        this.layout();
    }

    get marginRight() {
        return this.#marginRight ?? this.#margin;
    }

    @prop({ type: Number })
    set marginRight(value: number) {
        this.#marginRight = Math.max(0, finiteNumber(value, 0));
        this.layout();
    }

    get marginTop() {
        return this.#marginTop ?? this.#margin;
    }

    @prop({ type: Number })
    set marginTop(value: number) {
        this.#marginTop = Math.max(0, finiteNumber(value, 0));
        this.layout();
    }

    get marginBottom() {
        return this.#marginBottom ?? this.#margin;
    }

    @prop({ type: Number })
    set marginBottom(value: number) {
        this.#marginBottom = Math.max(0, finiteNumber(value, 0));
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

    get alignY() {
        return this.#alignY;
    }

    @prop({ type: String, default: 'start' })
    set alignY(value: string) {
        this.#alignY = parseAlign(value);
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
        const children = this.default?.children as ControlLayoutChild[] | undefined;
        if (!children || children.length === 0) {
            return;
        }

        const natural = this.measureControlNaturalSize();
        const width = this.#layoutWidth ?? this.#explicitWidth ?? natural.width;
        const height = this.#layoutHeight ?? this.#explicitHeight ?? natural.height;
        const innerWidth = Math.max(0, width - this.marginLeft - this.marginRight);
        const innerHeight = Math.max(0, height - this.marginTop - this.marginBottom);

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

    measureControlNaturalSize(): Size {
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

    setControlLayoutBox(x: number, y: number, width: number, height: number) {
        this.position.set(x, y);
        this.#layoutWidth = Math.max(0, width);
        this.#layoutHeight = Math.max(0, height);
        this.layout();
    }
}
