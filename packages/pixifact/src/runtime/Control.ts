import type { GroupOptions } from './Group';
import { Group } from './Group';
import {
    getFrameLayout,
    setFrameLayout,
    type FrameLayoutProp,
} from './frameLayout';

export class Control extends Group {
    constructor(options: GroupOptions = {}) {
        super(options);
    }

    get left() {
        return this.#layoutProp('left');
    }

    set left(value: number | undefined) {
        this.#setLayoutProp('left', value);
    }

    get right() {
        return this.#layoutProp('right');
    }

    set right(value: number | undefined) {
        this.#setLayoutProp('right', value);
    }

    get top() {
        return this.#layoutProp('top');
    }

    set top(value: number | undefined) {
        this.#setLayoutProp('top', value);
    }

    get bottom() {
        return this.#layoutProp('bottom');
    }

    set bottom(value: number | undefined) {
        this.#setLayoutProp('bottom', value);
    }

    get horizontal() {
        return this.#layoutProp('horizontal');
    }

    set horizontal(value: number | undefined) {
        this.#setLayoutProp('horizontal', value);
    }

    get vertical() {
        return this.#layoutProp('vertical');
    }

    set vertical(value: number | undefined) {
        this.#setLayoutProp('vertical', value);
    }

    #layoutProp(prop: FrameLayoutProp) {
        return getFrameLayout(this)[prop];
    }

    #setLayoutProp(prop: FrameLayoutProp, value: number | undefined) {
        setFrameLayout(this, { [prop]: value });
    }
}
