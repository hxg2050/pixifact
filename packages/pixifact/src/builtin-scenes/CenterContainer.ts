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
export class CenterContainer extends Control {
    @slot()
    declare readonly default: Container;

    #alignX: ControlAlign = 'center';
    #alignY: ControlAlign = 'center';
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

    get alignX() {
        return this.#alignX;
    }

    @prop({ type: String, default: 'center' })
    set alignX(value: string) {
        this.#alignX = parseAlign(value);
        this.layout();
    }

    get alignY() {
        return this.#alignY;
    }

    @prop({ type: String, default: 'center' })
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

        for (const child of children) {
            const props = controlChildProps(child);
            const childSize = controlMinSize(child, this.#baseSizes);
            const childWidth = fillOrExpand(props.hSize) ? width : childSize.width;
            const childHeight = fillOrExpand(props.vSize) ? height : childSize.height;
            setControlChildBox(child, {
                x: alignOffset(this.#alignX, Math.max(0, width - childWidth)),
                y: alignOffset(this.#alignY, Math.max(0, height - childHeight)),
                width: childWidth,
                height: childHeight,
            });
        }
    }

    measureControlNaturalSize(): Size {
        const children = this.default?.children as ControlLayoutChild[] | undefined;
        if (!children || children.length === 0) {
            return { width: 0, height: 0 };
        }
        const sizes = children.map((child) => controlMinSize(child, this.#baseSizes));
        return {
            width: sizes.reduce((max, size) => Math.max(max, size.width), 0),
            height: sizes.reduce((max, size) => Math.max(max, size.height), 0),
        };
    }

    setControlLayoutBox(x: number, y: number, width: number, height: number) {
        this.position.set(x, y);
        this.#layoutWidth = Math.max(0, width);
        this.#layoutHeight = Math.max(0, height);
        this.layout();
    }
}
