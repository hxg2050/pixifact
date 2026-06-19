import { Container, type ContainerChild } from 'pixi.js';
import { prop, scene, slot } from 'pixifact/compiler';
import { Control } from './Control';
import type { Size } from './controlLayout';
import type { FlexAlignSelf, FlexBasis, FlexItemLayoutProps } from './FlexItem';

type FlexAxis = 'row' | 'column';
type FlexDirection = 'row' | 'column';
type FlexAlign = 'start' | 'center' | 'end' | 'stretch';
type FlexJustify = 'start' | 'center' | 'end' | 'space-between';
type LayoutChild = ContainerChild & {
    getFlexItemLayoutProps?: () => FlexItemLayoutProps;
    measureControlNaturalSize?: () => Size;
    setControlLayoutBox?: (x: number, y: number, width: number, height: number) => void;
};

interface LayoutItem {
    child: LayoutChild;
    props: FlexItemLayoutProps;
    baseMain: number;
    baseCross: number;
    mainSize: number;
    crossSize: number;
}

@scene()
export class FlexLayout extends Control {
    @slot()
    declare readonly default: Container;

    #direction: FlexDirection = 'row';
    #align: FlexAlign = 'start';
    #justify: FlexJustify = 'start';
    #gap = 0;
    #paddingX = 0;
    #paddingY = 0;
    #paddingLeft: number | undefined;
    #paddingRight: number | undefined;
    #paddingTop: number | undefined;
    #paddingBottom: number | undefined;
    #baseSizes = new WeakMap<object, Size>();

    get direction() {
        return this.#direction;
    }

    @prop({ type: String, default: 'row' })
    set direction(value: string) {
        this.#direction = value === 'column' ? 'column' : 'row';
        this.refreshControlLayout();
    }

    get align() {
        return this.#align;
    }

    @prop({ type: String, default: 'start' })
    set align(value: string) {
        this.#align = parseAlign(value);
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

    get gap() {
        return this.#gap;
    }

    @prop({ type: Number, default: 0 })
    set gap(value: number) {
        this.#gap = Math.max(0, finiteNumber(value, 0));
        this.refreshControlLayout();
    }

    get paddingX() {
        return this.#paddingX;
    }

    @prop({ type: Number, default: 0 })
    set paddingX(value: number) {
        this.#paddingX = Math.max(0, finiteNumber(value, 0));
        this.refreshControlLayout();
    }

    get paddingY() {
        return this.#paddingY;
    }

    @prop({ type: Number, default: 0 })
    set paddingY(value: number) {
        this.#paddingY = Math.max(0, finiteNumber(value, 0));
        this.refreshControlLayout();
    }

    get paddingLeft() {
        return this.#paddingLeft ?? this.#paddingX;
    }

    @prop({ type: Number })
    set paddingLeft(value: number) {
        this.#paddingLeft = Math.max(0, finiteNumber(value, 0));
        this.refreshControlLayout();
    }

    get paddingRight() {
        return this.#paddingRight ?? this.#paddingX;
    }

    @prop({ type: Number })
    set paddingRight(value: number) {
        this.#paddingRight = Math.max(0, finiteNumber(value, 0));
        this.refreshControlLayout();
    }

    get paddingTop() {
        return this.#paddingTop ?? this.#paddingY;
    }

    @prop({ type: Number })
    set paddingTop(value: number) {
        this.#paddingTop = Math.max(0, finiteNumber(value, 0));
        this.refreshControlLayout();
    }

    get paddingBottom() {
        return this.#paddingBottom ?? this.#paddingY;
    }

    @prop({ type: Number })
    set paddingBottom(value: number) {
        this.#paddingBottom = Math.max(0, finiteNumber(value, 0));
        this.refreshControlLayout();
    }

    override layout() {
        const children = this.default?.children as LayoutChild[] | undefined;
        if (!children || children.length === 0) {
            this.syncControlBoxSize();
            return;
        }

        for (const child of children) {
            this.#rememberBaseSize(child);
        }

        const horizontal = this.#direction === 'row';
        const mainAxis: FlexAxis = horizontal ? 'row' : 'column';
        const crossAxis: FlexAxis = horizontal ? 'column' : 'row';
        const paddingMainStart = horizontal ? this.paddingLeft : this.paddingTop;
        const paddingMainEnd = horizontal ? this.paddingRight : this.paddingBottom;
        const paddingCrossStart = horizontal ? this.paddingTop : this.paddingLeft;
        const paddingCrossEnd = horizontal ? this.paddingBottom : this.paddingRight;
        const items = children.map((child) => this.#createLayoutItem(child, mainAxis, crossAxis));
        const gapTotal = this.#gap * Math.max(0, items.length - 1);
        const naturalMain = items.reduce((sum, item) => sum + item.baseMain + marginMain(item.props, horizontal), 0);
        const naturalCross = items.reduce((max, item) => Math.max(max, item.baseCross + marginCross(item.props, horizontal)), 0);
        const naturalWidth = horizontal
            ? naturalMain + gapTotal + paddingMainStart + paddingMainEnd
            : naturalCross + paddingCrossStart + paddingCrossEnd;
        const naturalHeight = horizontal
            ? naturalCross + paddingCrossStart + paddingCrossEnd
            : naturalMain + gapTotal + paddingMainStart + paddingMainEnd;
        const assigned = this.getAssignedControlBoxSize();
        const containerWidth = assigned.width ?? naturalWidth;
        const containerHeight = assigned.height ?? naturalHeight;
        const containerMain = horizontal ? containerWidth : containerHeight;
        const containerCross = horizontal ? containerHeight : containerWidth;
        const innerMain = Math.max(0, containerMain - paddingMainStart - paddingMainEnd - gapTotal);
        const innerCross = Math.max(0, containerCross - paddingCrossStart - paddingCrossEnd);
        const freeMain = innerMain - naturalMain;

        this.#resolveMainSizes(items, freeMain, horizontal);
        this.#resolveCrossSizes(items, innerCross, horizontal);
        this.#placeItems(items, containerMain, paddingMainStart, paddingMainEnd, paddingCrossStart, innerCross, horizontal);

        this.syncControlBoxSize();
    }

    override measureControlNaturalSize(): Size {
        const children = this.default?.children as LayoutChild[] | undefined;
        if (!children || children.length === 0) {
            return { width: 0, height: 0 };
        }
        const gapTotal = this.#gap * Math.max(0, children.length - 1);
        const sizes = children.map((child) => this.#naturalSize(child));
        if (this.#direction === 'row') {
            return {
                width: this.paddingLeft + this.paddingRight + gapTotal + sizes.reduce((sum, size) => sum + size.width, 0),
                height: this.paddingTop + this.paddingBottom + sizes.reduce((max, size) => Math.max(max, size.height), 0),
            };
        }
        return {
            width: this.paddingLeft + this.paddingRight + sizes.reduce((max, size) => Math.max(max, size.width), 0),
            height: this.paddingTop + this.paddingBottom + gapTotal + sizes.reduce((sum, size) => sum + size.height, 0),
        };
    }

    #createLayoutItem(child: LayoutChild, mainAxis: FlexAxis, crossAxis: FlexAxis): LayoutItem {
        const props = child.getFlexItemLayoutProps?.() ?? defaultItemProps;
        const natural = this.#naturalSize(child);
        const naturalMain = mainAxis === 'row' ? natural.width : natural.height;
        const naturalCross = crossAxis === 'row' ? natural.width : natural.height;
        const minMain = mainAxis === 'row' ? props.minWidth : props.minHeight;
        const maxMain = maxSize(mainAxis === 'row' ? props.maxWidth : props.maxHeight);
        const minCross = crossAxis === 'row' ? props.minWidth : props.minHeight;
        const maxCross = maxSize(crossAxis === 'row' ? props.maxWidth : props.maxHeight);
        const basis = basisSize(props.basis, naturalMain);
        const baseMain = clamp(basis, minMain, maxMain);
        const baseCross = clamp(naturalCross, minCross, maxCross);
        return {
            child,
            props,
            baseMain,
            baseCross,
            mainSize: baseMain,
            crossSize: baseCross,
        };
    }

    #resolveMainSizes(items: LayoutItem[], freeMain: number, horizontal: boolean) {
        if (freeMain > 0) {
            const totalGrow = items.reduce((sum, item) => sum + item.props.grow, 0);
            if (totalGrow > 0) {
                for (const item of items) {
                    item.mainSize = clampMain(item.baseMain + freeMain * (item.props.grow / totalGrow), item.props, horizontal);
                }
            }
            return;
        }

        if (freeMain < 0) {
            const totalShrink = items.reduce((sum, item) => sum + item.props.shrink * item.baseMain, 0);
            if (totalShrink > 0) {
                for (const item of items) {
                    const weighted = item.props.shrink * item.baseMain;
                    item.mainSize = clampMain(item.baseMain + freeMain * (weighted / totalShrink), item.props, horizontal);
                }
            }
        }
    }

    #resolveCrossSizes(items: LayoutItem[], innerCross: number, horizontal: boolean) {
        for (const item of items) {
            const alignSelf = item.props.alignSelf === 'auto' ? this.#align : item.props.alignSelf;
            if (alignSelf === 'stretch') {
                item.crossSize = clampCross(innerCross - marginCross(item.props, horizontal), item.props, horizontal);
            }
        }
    }

    #placeItems(
        items: LayoutItem[],
        containerMain: number,
        paddingMainStart: number,
        paddingMainEnd: number,
        paddingCrossStart: number,
        innerCross: number,
        horizontal: boolean,
    ) {
        const usedMain = items.reduce((sum, item) => sum + item.mainSize + marginMain(item.props, horizontal), 0);
        const remaining = Math.max(0, containerMain - paddingMainStart - paddingMainEnd - usedMain - this.#gap * Math.max(0, items.length - 1));
        const actualGap = this.#justify === 'space-between' && items.length > 1
            ? this.#gap + remaining / (items.length - 1)
            : this.#gap;
        let cursor = paddingMainStart + justifyOffset(this.#justify, remaining);

        for (const item of items) {
            const mainStartMargin = horizontal ? item.props.marginLeft : item.props.marginTop;
            const mainEndMargin = horizontal ? item.props.marginRight : item.props.marginBottom;
            const crossStartMargin = horizontal ? item.props.marginTop : item.props.marginLeft;
            const crossEndMargin = horizontal ? item.props.marginBottom : item.props.marginRight;
            const alignSelf = item.props.alignSelf === 'auto' ? this.#align : item.props.alignSelf;
            const crossFree = Math.max(0, innerCross - item.crossSize - crossStartMargin - crossEndMargin);
            const main = cursor + mainStartMargin;
            const cross = paddingCrossStart + crossStartMargin + alignOffset(alignSelf, crossFree);
            const x = horizontal ? main : cross;
            const y = horizontal ? cross : main;
            const width = horizontal ? item.mainSize : item.crossSize;
            const height = horizontal ? item.crossSize : item.mainSize;

            setChildBox(item.child, x, y, width, height);
            cursor = main + item.mainSize + mainEndMargin + actualGap;
        }
    }

    #rememberBaseSize(child: LayoutChild) {
        if (!this.#baseSizes.has(child)) {
            this.#baseSizes.set(child, {
                width: child.width,
                height: child.height,
            });
        }
    }

    #naturalSize(child: LayoutChild): Size {
        const measured = child.measureControlNaturalSize?.();
        if (measured) {
            return measured;
        }
        return this.#baseSizes.get(child) ?? { width: child.width, height: child.height };
    }
}

const defaultItemProps: FlexItemLayoutProps = {
    grow: 0,
    shrink: 1,
    basis: 'auto',
    minWidth: 0,
    minHeight: 0,
    maxWidth: -1,
    maxHeight: -1,
    marginLeft: 0,
    marginRight: 0,
    marginTop: 0,
    marginBottom: 0,
    alignSelf: 'auto',
};

function setChildBox(child: LayoutChild, x: number, y: number, width: number, height: number) {
    if (child.setControlLayoutBox) {
        child.setControlLayoutBox(x, y, width, height);
        return;
    }
    child.position.set(x, y);
    child.width = width;
    child.height = height;
}

function marginMain(props: FlexItemLayoutProps, horizontal: boolean) {
    return horizontal
        ? props.marginLeft + props.marginRight
        : props.marginTop + props.marginBottom;
}

function marginCross(props: FlexItemLayoutProps, horizontal: boolean) {
    return horizontal
        ? props.marginTop + props.marginBottom
        : props.marginLeft + props.marginRight;
}

function clampMain(value: number, props: FlexItemLayoutProps, horizontal: boolean) {
    return horizontal
        ? clamp(value, props.minWidth, maxSize(props.maxWidth))
        : clamp(value, props.minHeight, maxSize(props.maxHeight));
}

function clampCross(value: number, props: FlexItemLayoutProps, horizontal: boolean) {
    return horizontal
        ? clamp(value, props.minHeight, maxSize(props.maxHeight))
        : clamp(value, props.minWidth, maxSize(props.maxWidth));
}

function basisSize(basis: FlexBasis, naturalSize: number) {
    return basis === 'auto' ? naturalSize : basis;
}

function maxSize(value: number) {
    return value >= 0 ? value : Number.POSITIVE_INFINITY;
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function justifyOffset(justify: FlexJustify, remaining: number) {
    if (justify === 'center') {
        return remaining / 2;
    }
    if (justify === 'end') {
        return remaining;
    }
    return 0;
}

function alignOffset(align: FlexAlign | FlexAlignSelf, remaining: number) {
    if (align === 'center') {
        return remaining / 2;
    }
    if (align === 'end') {
        return remaining;
    }
    return 0;
}

function parseAlign(value: string): FlexAlign {
    if (value === 'center' || value === 'end' || value === 'stretch') {
        return value;
    }
    return 'start';
}

function parseJustify(value: string): FlexJustify {
    if (value === 'center' || value === 'end' || value === 'space-between') {
        return value;
    }
    return 'start';
}

function finiteNumber(value: number, fallback: number) {
    return Number.isFinite(value) ? value : fallback;
}
