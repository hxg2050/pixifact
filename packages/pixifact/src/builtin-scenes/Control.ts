import { Container } from 'pixi.js';
import { prop, scene, slot } from 'pixifact/compiler';
import { Group } from 'pixifact/runtime';
import {
    alignOffset,
    defaultControlLayoutProps,
    finiteNumber,
    measureChildren,
    measureChildrenBounds,
    parseAlign,
    parseSizeMode,
    type ControlAlign,
    type ControlLayoutProps,
    type ControlSizeMode,
    type Size,
} from './controlLayout';

@scene()
export class Control extends Group {
    @slot()
    readonly default!: Container;

    #boxWidth: number | undefined;
    #boxHeight: number | undefined;
    #minWidth = 0;
    #minHeight = 0;
    #hSize: ControlSizeMode = 'content';
    #vSize: ControlSizeMode = 'content';
    #stretch = 1;
    #alignX: ControlAlign = 'start';
    #alignY: ControlAlign = 'start';

    override get width() {
        return this.#boxWidth ?? this.measureControlNaturalSize().width;
    }

    override set width(value: number) {
        this.#boxWidth = Math.max(0, finiteNumber(value, 0));
        this.#layoutContent();
        this.requestParentLayout();
    }

    override get height() {
        return this.#boxHeight ?? this.measureControlNaturalSize().height;
    }

    override set height(value: number) {
        this.#boxHeight = Math.max(0, finiteNumber(value, 0));
        this.#layoutContent();
        this.requestParentLayout();
    }

    get minWidth() {
        return this.#minWidth;
    }

    @prop({ type: Number, default: 0 })
    set minWidth(value: number) {
        this.#minWidth = Math.max(0, finiteNumber(value, 0));
        this.#layoutContent();
        this.requestParentLayout();
    }

    get minHeight() {
        return this.#minHeight;
    }

    @prop({ type: Number, default: 0 })
    set minHeight(value: number) {
        this.#minHeight = Math.max(0, finiteNumber(value, 0));
        this.#layoutContent();
        this.requestParentLayout();
    }

    get hSize() {
        return this.#hSize;
    }

    @prop({ type: String, default: 'content' })
    set hSize(value: string) {
        this.#hSize = parseSizeMode(value);
        this.requestParentLayout();
    }

    get vSize() {
        return this.#vSize;
    }

    @prop({ type: String, default: 'content' })
    set vSize(value: string) {
        this.#vSize = parseSizeMode(value);
        this.requestParentLayout();
    }

    get stretch() {
        return this.#stretch;
    }

    @prop({ type: Number, default: 1 })
    set stretch(value: number) {
        this.#stretch = Math.max(0, finiteNumber(value, 1));
        this.requestParentLayout();
    }

    get alignX() {
        return this.#alignX;
    }

    @prop({ type: String, default: 'start' })
    set alignX(value: string) {
        this.#alignX = parseAlign(value);
        this.#layoutContent();
    }

    get alignY() {
        return this.#alignY;
    }

    @prop({ type: String, default: 'start' })
    set alignY(value: string) {
        this.#alignY = parseAlign(value);
        this.#layoutContent();
    }

    onMounted() {
        this.default.on('childAdded', this.#layoutContent, this);
        this.default.on('childRemoved', this.#layoutContent, this);
        this.once('destroyed', this.#unmountLayout, this);
        this.#layoutContent();
    }

    #unmountLayout() {
        this.default.off('childAdded', this.#layoutContent, this);
        this.default.off('childRemoved', this.#layoutContent, this);
    }

    getControlLayoutProps(): ControlLayoutProps {
        return {
            ...defaultControlLayoutProps,
            minWidth: this.#minWidth,
            minHeight: this.#minHeight,
            hSize: this.#hSize,
            vSize: this.#vSize,
            stretch: this.#stretch,
        };
    }

    measureControlNaturalSize(): Size {
        const contentSize = this.default ? measureChildren(this.default) : { width: 0, height: 0 };
        return {
            width: Math.max(this.#minWidth, contentSize.width),
            height: Math.max(this.#minHeight, contentSize.height),
        };
    }

    setControlLayoutBox(x: number, y: number, width: number, height: number) {
        this.position.set(x, y);
        this.#boxWidth = Math.max(0, width);
        this.#boxHeight = Math.max(0, height);
        this.#layoutContent();
    }

    #layoutContent() {
        if (!this.default) {
            return;
        }
        const bounds = measureChildrenBounds(this.default);
        const boxWidth = this.#boxWidth ?? Math.max(this.#minWidth, bounds.width);
        const boxHeight = this.#boxHeight ?? Math.max(this.#minHeight, bounds.height);
        const offsetX = alignOffset(this.#alignX, Math.max(0, boxWidth - bounds.width)) - bounds.x;
        const offsetY = alignOffset(this.#alignY, Math.max(0, boxHeight - bounds.height)) - bounds.y;
        this.default.position.set(offsetX, offsetY);
    }

    protected requestParentLayout() {
        const parent = this.parent as (Container & { layout?: () => void }) | null;
        parent?.layout?.();
    }
}
