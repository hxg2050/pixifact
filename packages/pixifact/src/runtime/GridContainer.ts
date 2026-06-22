import { Control } from './Control';
import type { GroupOptions } from './Group';
import {
    finiteNumber,
    layoutChild,
    parseStackAlign,
    stackAlignOffset,
    stackChildSize,
    type StackAlign,
} from './stackLayout';

export class GridContainer extends Control {
    #columns = 1;
    #gapX = 0;
    #gapY = 0;
    #alignX: StackAlign = 'start';
    #alignY: StackAlign = 'start';
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

    get columns() {
        return this.#columns;
    }

    set columns(value: number) {
        this.#columns = Math.max(1, Math.floor(finiteNumber(value, 1)));
        this.layout();
    }

    get gapX() {
        return this.#gapX;
    }

    set gapX(value: number) {
        this.#gapX = Math.max(0, finiteNumber(value, 0));
        this.layout();
    }

    get gapY() {
        return this.#gapY;
    }

    set gapY(value: number) {
        this.#gapY = Math.max(0, finiteNumber(value, 0));
        this.layout();
    }

    get alignX() {
        return this.#alignX;
    }

    set alignX(value: string) {
        this.#alignX = parseStackAlign(value);
        this.layout();
    }

    get alignY() {
        return this.#alignY;
    }

    set alignY(value: string) {
        this.#alignY = parseStackAlign(value);
        this.layout();
    }

    override layout() {
        const children = this.children;
        const metrics = measureGrid(children, this.#columns, this.#gapX, this.#gapY);
        const width = this.#explicitWidth ? this.width : metrics.width;
        const height = this.#explicitHeight ? this.height : metrics.height;
        if (width !== this.width || height !== this.height) {
            this.setBoxSize(width, height);
        }

        let rowY = 0;
        for (let row = 0; row < metrics.rowHeights.length; row++) {
            let columnX = 0;
            for (let column = 0; column < metrics.columnWidths.length; column++) {
                const child = children[row * this.#columns + column];
                if (child) {
                    const size = stackChildSize(child);
                    child.position.set(
                        columnX + stackAlignOffset(this.#alignX, Math.max(0, metrics.columnWidths[column] - size.width)),
                        rowY + stackAlignOffset(this.#alignY, Math.max(0, metrics.rowHeights[row] - size.height)),
                    );
                    layoutChild(child);
                }
                columnX += metrics.columnWidths[column] + this.#gapX;
            }
            rowY += metrics.rowHeights[row] + this.#gapY;
        }
    }
}

function measureGrid(children: readonly { width: number; height: number }[], columns: number, gapX: number, gapY: number) {
    if (children.length === 0) {
        return { width: 0, height: 0, columnWidths: [], rowHeights: [] };
    }

    const columnCount = Math.min(columns, children.length);
    const rowCount = Math.ceil(children.length / columns);
    const columnWidths = Array.from({ length: columnCount }, () => 0);
    const rowHeights = Array.from({ length: rowCount }, () => 0);

    for (let index = 0; index < children.length; index++) {
        const child = children[index];
        const column = index % columns;
        const row = Math.floor(index / columns);
        columnWidths[column] = Math.max(columnWidths[column], child.width);
        rowHeights[row] = Math.max(rowHeights[row], child.height);
    }

    return {
        width: columnWidths.reduce((sum, width) => sum + width, 0) + gapX * Math.max(0, columnWidths.length - 1),
        height: rowHeights.reduce((sum, height) => sum + height, 0) + gapY * Math.max(0, rowHeights.length - 1),
        columnWidths,
        rowHeights,
    };
}
