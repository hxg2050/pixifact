import { GameObject } from "../GameObject";
import { Group } from "../group";
import { Component } from "./Component";
import { onlyOnceQueueMicrotask } from "../utils/onlyOnceQueueMicrotask";

export class GridLayout extends Component<Group> {
    private _active = false;
    private _refresh = false;

    /**
     * 横向列数。
     */
    private _col = 1;
    get col() {
        return this._col;
    }
    set col(val: number) {
        const next = this.normalizeCount(val);
        if (this._col === next) {
            return;
        }
        this._col = next;
        this.markResize();
    }

    /**
     * 单元格宽度。
     */
    private _gridWidth = 1;
    get gridWidth() {
        return this._gridWidth;
    }
    set gridWidth(val: number) {
        if (this._gridWidth === val) {
            return;
        }
        this._gridWidth = val;
        this.markResize();
    }

    /**
     * 单元格高度。
     */
    private _gridHeight = 1;
    get gridHeight() {
        return this._gridHeight;
    }
    set gridHeight(val: number) {
        if (this._gridHeight === val) {
            return;
        }
        this._gridHeight = val;
        this.markResize();
    }

    /**
     * 横向间距，作用于 x 轴。
     */
    private _gapHorizontal = 0;
    get gapHorizontal() {
        return this._gapHorizontal;
    }
    set gapHorizontal(val: number) {
        if (this._gapHorizontal === val) {
            return;
        }
        this._gapHorizontal = val;
        this.markResize();
    }

    /**
     * 纵向间距，作用于 y 轴。
     */
    private _gapVertical = 0;
    get gapVertical() {
        return this._gapVertical;
    }
    set gapVertical(val: number) {
        if (this._gapVertical === val) {
            return;
        }
        this._gapVertical = val;
        this.markResize();
    }

    private resizeLater = onlyOnceQueueMicrotask(() => {
        if (!this._active || !this._refresh) {
            return;
        }
        this.resize();
    });

    private handleChildAdded = () => {
        this.markResize();
    }

    private handleChildRemoved = () => {
        this.markResize();
    }

    awake(): void {
        this._active = true;
        this.gameObject.emitter.on(GameObject.Event.CHILD_ADDED, this.handleChildAdded, this);
        this.gameObject.emitter.on(GameObject.Event.CHILD_REMOVED, this.handleChildRemoved, this);
        this.resize();
    }

    private normalizeCount(val: number) {
        if (!Number.isFinite(val)) {
            return 1;
        }
        return Math.max(1, Math.floor(val));
    }

    private markResize() {
        this._refresh = true;
        if (this._active) {
            this.resizeLater();
        }
    }

    /**
     * 计算布局
     */
    resize() {
        this._refresh = false;
        const children = this.gameObject.children;
        const colCount = this.col;

        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            child.width = this.gridWidth;
            child.height = this.gridHeight;

            const col = i % colCount;
            const row = Math.floor(i / colCount);

            child.transform.setPosition(
                col * (this.gridWidth + this.gapHorizontal),
                row * (this.gridHeight + this.gapVertical),
            );
        }
    }

    onDestroy(): void {
        this._active = false;
        this.gameObject.emitter.off(GameObject.Event.CHILD_ADDED, this.handleChildAdded, this);
        this.gameObject.emitter.off(GameObject.Event.CHILD_REMOVED, this.handleChildRemoved, this);
    }
}
