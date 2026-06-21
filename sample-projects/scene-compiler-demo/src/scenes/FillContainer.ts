import { Container } from 'pixi.js';
import { Group } from 'pixifact/runtime';
import { prop, scene, slot } from 'pixifact/compiler';

@scene()
export class FillContainer extends Group {
    @slot()
    declare readonly default: Container;

    #margin = 0;
    #marginLeft: number | undefined;
    #marginRight: number | undefined;
    #marginTop: number | undefined;
    #marginBottom: number | undefined;

    override get width() {
        return super.width;
    }

    override set width(value: number) {
        super.width = nonNegative(value);
        this.layout();
    }

    override get height() {
        return super.height;
    }

    override set height(value: number) {
        super.height = nonNegative(value);
        this.layout();
    }

    override setSize(value: number | { width: number; height?: number }, height?: number) {
        if (typeof value === 'number') {
            super.setSize(nonNegative(value), nonNegative(height ?? value));
        } else {
            super.setSize(
                nonNegative(value.width),
                nonNegative(value.height ?? value.width),
            );
        }
        this.layout();
    }

    setControlLayoutBox(x: number, y: number, width: number, height: number) {
        this.position.set(x, y);
        super.setSize(nonNegative(width), nonNegative(height));
        this.layout();
    }

    get margin() {
        return this.#margin;
    }

    @prop({ type: Number, default: 0 })
    set margin(value: number) {
        this.#margin = nonNegative(value);
        this.layout();
    }

    get marginLeft() {
        return this.#marginLeft ?? this.#margin;
    }

    @prop({ type: Number })
    set marginLeft(value: number) {
        this.#marginLeft = nonNegative(value);
        this.layout();
    }

    get marginRight() {
        return this.#marginRight ?? this.#margin;
    }

    @prop({ type: Number })
    set marginRight(value: number) {
        this.#marginRight = nonNegative(value);
        this.layout();
    }

    get marginTop() {
        return this.#marginTop ?? this.#margin;
    }

    @prop({ type: Number })
    set marginTop(value: number) {
        this.#marginTop = nonNegative(value);
        this.layout();
    }

    get marginBottom() {
        return this.#marginBottom ?? this.#margin;
    }

    @prop({ type: Number })
    set marginBottom(value: number) {
        this.#marginBottom = nonNegative(value);
        this.layout();
    }

    onMounted() {
        this.default.on('childAdded', this.#layoutChild, this);
        this.once('destroyed', () => {
            this.default.off('childAdded', this.#layoutChild, this);
        });
        this.layout();
    }

    layout() {
        const x = this.marginLeft;
        const y = this.marginTop;
        const width = Math.max(0, this.width - this.marginLeft - this.marginRight);
        const height = Math.max(0, this.height - this.marginTop - this.marginBottom);

        for (const child of this.default.children) {
            setChildBox(child, x, y, width, height);
        }
    }

    #layoutChild(child: Container) {
        const x = this.marginLeft;
        const y = this.marginTop;
        const width = Math.max(0, this.width - this.marginLeft - this.marginRight);
        const height = Math.max(0, this.height - this.marginTop - this.marginBottom);
        setChildBox(child, x, y, width, height);
    }
}

function setChildBox(child: Container, x: number, y: number, width: number, height: number) {
    const layoutChild = child as Container & {
        setControlLayoutBox?: (x: number, y: number, width: number, height: number) => void;
    };
    if (layoutChild.setControlLayoutBox) {
        layoutChild.setControlLayoutBox(x, y, width, height);
        return;
    }
    child.position.set(x, y);
    child.width = width;
    child.height = height;
}

function nonNegative(value: number) {
    return Math.max(0, value);
}
