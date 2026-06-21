import { Control } from './Control';
import type { GroupOptions } from './Group';
import {
    finiteNumber,
    layoutChild,
    measureStackNaturalSize,
    parseStackAlign,
    parseStackJustify,
    stackAlignOffset,
    stackChildSize,
    stackJustifyOffset,
    type StackAlign,
    type StackJustify,
} from './stackLayout';

export class VBoxContainer extends Control {
    #gap = 0;
    #alignX: StackAlign = 'start';
    #justify: StackJustify = 'start';
    #explicitWidth = false;
    #explicitHeight = false;

    constructor(options: GroupOptions = {}) {
        super(options);
        this.#explicitWidth = options.width !== undefined;
        this.#explicitHeight = options.height !== undefined;
    }

    override get width() {
        return super.width;
    }

    override set width(value: number) {
        this.#explicitWidth = true;
        super.width = value;
    }

    override get height() {
        return super.height;
    }

    override set height(value: number) {
        this.#explicitHeight = true;
        super.height = value;
    }

    override setSize(value: number | { width: number; height?: number }, height?: number) {
        this.#explicitWidth = true;
        this.#explicitHeight = true;
        super.setSize(value as number, height);
    }

    get gap() {
        return this.#gap;
    }

    set gap(value: number) {
        this.#gap = Math.max(0, finiteNumber(value, 0));
        this.layout();
    }

    get alignX() {
        return this.#alignX;
    }

    set alignX(value: string) {
        this.#alignX = parseStackAlign(value);
        this.layout();
    }

    get justify() {
        return this.#justify;
    }

    set justify(value: string) {
        this.#justify = parseStackJustify(value);
        this.layout();
    }

    override layout() {
        const children = this.children;
        const natural = measureStackNaturalSize('vertical', children, this.#gap);
        const width = this.#explicitWidth ? this.width : natural.width;
        const height = this.#explicitHeight ? this.height : natural.height;
        if (width !== this.width || height !== this.height) {
            this.setBoxSize(width, height);
        }

        const remaining = Math.max(0, height - natural.height);
        const gap = this.#justify === 'space-between' && children.length > 1
            ? this.#gap + remaining / (children.length - 1)
            : this.#gap;
        let cursor = stackJustifyOffset(this.#justify, remaining);

        for (const child of children) {
            const size = stackChildSize(child);
            child.position.set(stackAlignOffset(this.#alignX, Math.max(0, width - size.width)), cursor);
            layoutChild(child);
            cursor += size.height + gap;
        }
    }
}
