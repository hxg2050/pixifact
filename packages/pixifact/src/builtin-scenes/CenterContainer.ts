import { Container } from 'pixi.js';
import { prop, scene, slot } from 'pixifact/compiler';
import { Control } from './Control';
import {
    alignOffset,
    controlChildProps,
    controlMinSize,
    fillOrExpand,
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
    #baseSizes = new WeakMap<object, Size>();

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

    override layout() {
        const size = this.syncControlBoxSize();
        const children = this.default?.children as ControlLayoutChild[] | undefined;
        if (!children || children.length === 0) {
            return;
        }

        for (const child of children) {
            const props = controlChildProps(child);
            const childSize = controlMinSize(child, this.#baseSizes);
            const childWidth = fillOrExpand(props.hSize) ? size.width : childSize.width;
            const childHeight = fillOrExpand(props.vSize) ? size.height : childSize.height;
            setControlChildBox(child, {
                x: alignOffset(this.#alignX, Math.max(0, size.width - childWidth)),
                y: alignOffset(this.#alignY, Math.max(0, size.height - childHeight)),
                width: childWidth,
                height: childHeight,
            });
        }
    }

    override measureControlNaturalSize(): Size {
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
}
