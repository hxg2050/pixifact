import { Container } from 'pixi.js';
import { prop, scene, slot } from 'pixifact/compiler';
import { Group } from 'pixifact/runtime';
import {
    alignOffset,
    boxSize,
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

    #explicitWidth: number | undefined;
    #explicitHeight: number | undefined;
    #layoutWidth: number | undefined;
    #layoutHeight: number | undefined;
    #minWidth = 0;
    #minHeight = 0;
    #hSize: ControlSizeMode = 'content';
    #vSize: ControlSizeMode = 'content';
    #stretch = 1;
    #alignX: ControlAlign = 'start';
    #alignY: ControlAlign = 'start';

    override get width() {
        return this.getControlBoxSize().width;
    }

    override set width(value: number) {
        this.#explicitWidth = Math.max(0, finiteNumber(value, 0));
        this.refreshControlLayout();
    }

    override get height() {
        return this.getControlBoxSize().height;
    }

    override set height(value: number) {
        this.#explicitHeight = Math.max(0, finiteNumber(value, 0));
        this.refreshControlLayout();
    }

    override getSize(out: Size = { width: 0, height: 0 }) {
        out.width = this.width;
        out.height = this.height;
        return out;
    }

    override setSize(value: number | { width: number; height?: number }, height?: number) {
        const size = boxSize(value, height);
        this.#explicitWidth = size.width;
        this.#explicitHeight = size.height;
        this.refreshControlLayout();
    }

    get minWidth() {
        return this.#minWidth;
    }

    @prop({ type: Number, default: 0 })
    set minWidth(value: number) {
        this.#minWidth = Math.max(0, finiteNumber(value, 0));
        this.refreshControlLayout();
    }

    get minHeight() {
        return this.#minHeight;
    }

    @prop({ type: Number, default: 0 })
    set minHeight(value: number) {
        this.#minHeight = Math.max(0, finiteNumber(value, 0));
        this.refreshControlLayout();
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
        this.default.on('childAdded', this.#refreshFromChildren, this);
        this.default.on('childRemoved', this.#refreshFromChildren, this);
        this.once('destroyed', this.#unmountLayout, this);
        this.layout();
    }

    #unmountLayout() {
        this.default.off('childAdded', this.#refreshFromChildren, this);
        this.default.off('childRemoved', this.#refreshFromChildren, this);
    }

    #refreshFromChildren() {
        this.refreshControlLayout();
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
        this.#layoutWidth = Math.max(0, finiteNumber(width, 0));
        this.#layoutHeight = Math.max(0, finiteNumber(height, 0));
        this.layout();
    }

    layout() {
        const size = this.syncControlBoxSize();
        this.layoutDefaultSlot(size);
    }

    protected layoutDefaultSlot(size: Size = this.getControlBoxSize()) {
        if (!this.default) {
            return;
        }
        const bounds = measureChildrenBounds(this.default);
        const offsetX = alignOffset(this.#alignX, Math.max(0, size.width - bounds.width)) - bounds.x;
        const offsetY = alignOffset(this.#alignY, Math.max(0, size.height - bounds.height)) - bounds.y;
        this.default.position.set(offsetX, offsetY);
    }

    protected syncControlBoxSize() {
        const size = this.getControlBoxSize();
        super.setSize(
            Math.max(0, finiteNumber(size.width, 0)),
            Math.max(0, finiteNumber(size.height, 0)),
        );
        return size;
    }

    protected getControlBoxSize(): Size {
        const natural = this.measureControlNaturalSize();
        return {
            width: this.#layoutWidth ?? this.#explicitWidth ?? natural.width,
            height: this.#layoutHeight ?? this.#explicitHeight ?? natural.height,
        };
    }

    protected getAssignedControlBoxSize() {
        return {
            width: this.#layoutWidth ?? this.#explicitWidth,
            height: this.#layoutHeight ?? this.#explicitHeight,
        };
    }

    protected refreshControlLayout() {
        this.layout();
        this.requestParentLayout();
    }

    protected requestParentLayout() {
        let parent = this.parent as (Container & { layout?: () => void }) | null;
        while (parent) {
            if (typeof parent.layout === 'function') {
                parent.layout();
                return;
            }
            parent = parent.parent as (Container & { layout?: () => void }) | null;
        }
    }
}
