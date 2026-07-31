import {
    BitmapText,
    Graphics,
    Text,
    type TextOptions,
    type TextStyleFontWeight,
} from 'pixi.js';
import { Control } from './Control';
import type { GroupOptions } from './Group';

export type TextBoxAlign = 'start' | 'center' | 'end';
export type TextBoxOverflow = 'visible' | 'clip';
export type TextBoxFontWeight = 400 | 500 | 600 | 700 | '400' | '500' | '600' | '700' | 'bold';

export type TextBoxOptions = GroupOptions & {
    text?: string;
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: TextBoxFontWeight;
    fill?: number;
    lineHeight?: number;
    letterSpacing?: number;
    wordWrap?: boolean;
    alignX?: TextBoxAlign;
    alignY?: TextBoxAlign;
    overflow?: TextBoxOverflow;
};

type TextBoxRenderer = Text | BitmapText;

export class TextBoxControl<T extends TextBoxRenderer> extends Control {
    readonly #textNode: T;
    readonly #clipMask = new Graphics();
    #fontFamily = 'Arial';
    #fontSize = 16;
    #fontWeight: TextBoxFontWeight = 400;
    #fill = 0x111827;
    #lineHeight = 0;
    #letterSpacing = 0;
    #wordWrap = false;
    #alignX: TextBoxAlign = 'start';
    #alignY: TextBoxAlign = 'start';
    #overflow: TextBoxOverflow = 'visible';

    constructor(options: TextBoxOptions, createTextNode: (options: TextOptions) => T) {
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
        this.#textNode = createTextNode({
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

    set fontWeight(value: TextBoxFontWeight) {
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

    set alignX(value: TextBoxAlign) {
        this.#alignX = value;
        this.#textNode.style.align = horizontalTextAlign(value);
        this.layout();
    }

    get alignY() {
        return this.#alignY;
    }

    set alignY(value: TextBoxAlign) {
        this.#alignY = value;
        this.layout();
    }

    get overflow() {
        return this.#overflow;
    }

    set overflow(value: TextBoxOverflow) {
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

function horizontalTextAlign(align: TextBoxAlign) {
    if (align === 'center') {
        return 'center';
    }
    if (align === 'end') {
        return 'right';
    }
    return 'left';
}

function alignmentFactor(align: TextBoxAlign) {
    if (align === 'center') {
        return 0.5;
    }
    if (align === 'end') {
        return 1;
    }
    return 0;
}
