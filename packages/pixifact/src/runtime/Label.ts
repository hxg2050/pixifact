import {
    Graphics,
    Text,
    type TextStyleFontWeight,
} from 'pixi.js';
import { Control } from './Control';
import type { GroupOptions } from './Group';

export type LabelAlign = 'start' | 'center' | 'end';
export type LabelOverflow = 'visible' | 'clip';
export type LabelFontWeight = 400 | 500 | 600 | 700 | '400' | '500' | '600' | '700' | 'bold';

export type LabelOptions = GroupOptions & {
    text?: string;
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: LabelFontWeight;
    fill?: number;
    lineHeight?: number;
    letterSpacing?: number;
    wordWrap?: boolean;
    alignX?: LabelAlign;
    alignY?: LabelAlign;
    overflow?: LabelOverflow;
};

export class Label extends Control {
    readonly #textNode: Text;
    readonly #clipMask = new Graphics();
    #fontFamily = 'Arial';
    #fontSize = 16;
    #fontWeight: LabelFontWeight = 400;
    #fill = 0x111827;
    #lineHeight = 0;
    #letterSpacing = 0;
    #wordWrap = false;
    #alignX: LabelAlign = 'start';
    #alignY: LabelAlign = 'start';
    #overflow: LabelOverflow = 'visible';

    constructor(options: LabelOptions = {}) {
        const {
            text = 'Text',
            width = 120,
            height = 28,
            fontFamily = 'Arial',
            fontSize = 16,
            fontWeight = 400,
            fill = 0x111827,
            lineHeight = 0,
            letterSpacing = 0,
            wordWrap = false,
            alignX = 'start',
            alignY = 'start',
            overflow = 'visible',
            ...groupOptions
        } = options;
        super({ ...groupOptions, width, height });

        this.#fontFamily = fontFamily;
        this.#fontSize = fontSize;
        this.#fontWeight = fontWeight;
        this.#fill = fill;
        this.#lineHeight = lineHeight;
        this.#letterSpacing = letterSpacing;
        this.#wordWrap = wordWrap;
        this.#alignX = alignX;
        this.#alignY = alignY;
        this.#overflow = overflow;
        this.#textNode = new Text({
            text,
            style: {
                fontFamily,
                fontSize,
                fontWeight: String(fontWeight) as TextStyleFontWeight,
                fill,
                lineHeight,
                letterSpacing,
                wordWrap,
                wordWrapWidth: width,
                align: horizontalTextAlign(alignX),
            },
        });
        super.addChild(this.#textNode, this.#clipMask);
        this.layout();
    }

    get text() {
        return this.#textNode.text;
    }

    set text(value: string) {
        this.#textNode.text = value;
        this.layout();
    }

    get fontFamily() {
        return this.#fontFamily;
    }

    set fontFamily(value: string) {
        this.#fontFamily = value;
        this.#textNode.style.fontFamily = value;
        this.layout();
    }

    get fontSize() {
        return this.#fontSize;
    }

    set fontSize(value: number) {
        this.#fontSize = value;
        this.#textNode.style.fontSize = value;
        this.layout();
    }

    get fontWeight() {
        return this.#fontWeight;
    }

    set fontWeight(value: LabelFontWeight) {
        this.#fontWeight = value;
        this.#textNode.style.fontWeight = String(value) as TextStyleFontWeight;
        this.layout();
    }

    get fill() {
        return this.#fill;
    }

    set fill(value: number) {
        this.#fill = value;
        this.#textNode.style.fill = value;
        this.layout();
    }

    get lineHeight() {
        return this.#lineHeight;
    }

    set lineHeight(value: number) {
        this.#lineHeight = value;
        this.#textNode.style.lineHeight = value;
        this.layout();
    }

    get letterSpacing() {
        return this.#letterSpacing;
    }

    set letterSpacing(value: number) {
        this.#letterSpacing = value;
        this.#textNode.style.letterSpacing = value;
        this.layout();
    }

    get wordWrap() {
        return this.#wordWrap;
    }

    set wordWrap(value: boolean) {
        this.#wordWrap = value;
        this.#textNode.style.wordWrap = value;
        this.layout();
    }

    get alignX() {
        return this.#alignX;
    }

    set alignX(value: LabelAlign) {
        this.#alignX = value;
        this.#textNode.style.align = horizontalTextAlign(value);
        this.layout();
    }

    get alignY() {
        return this.#alignY;
    }

    set alignY(value: LabelAlign) {
        this.#alignY = value;
        this.layout();
    }

    get overflow() {
        return this.#overflow;
    }

    set overflow(value: LabelOverflow) {
        this.#overflow = value;
        this.layout();
    }

    override layout() {
        super.layout();
        if (!this.#textNode) {
            return;
        }
        this.#textNode.style.wordWrapWidth = this.width;
        this.#textNode.anchor.set(
            alignmentFactor(this.#alignX),
            alignmentFactor(this.#alignY),
        );
        this.#textNode.position.set(
            this.width * alignmentFactor(this.#alignX),
            this.height * alignmentFactor(this.#alignY),
        );
        this.#clipMask.clear().rect(0, 0, this.width, this.height).fill(0xffffff);
        const clip = this.#overflow === 'clip';
        this.#clipMask.visible = clip;
        this.#textNode.mask = clip ? this.#clipMask : null;
    }
}

function horizontalTextAlign(align: LabelAlign) {
    if (align === 'center') {
        return 'center';
    }
    if (align === 'end') {
        return 'right';
    }
    return 'left';
}

function alignmentFactor(align: LabelAlign) {
    if (align === 'center') {
        return 0.5;
    }
    if (align === 'end') {
        return 1;
    }
    return 0;
}
