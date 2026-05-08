import { GameObject } from "../GameObject";
import { Component } from "./Component";
import type { Group } from "../group";
import { onlyOnceQueueMicrotask } from "../utils/onlyOnceQueueMicrotask";

/**
 * 控制布局
 * 当添加了控制布局组件后，原本的position、size和scale可能会被自动管控手动设置将不会生效
 * ```ts
 * const node = GameObject.instantiate(Group, parent, {
 *   width: 100,
 *   height: 100,
 *   anchorX: 0.5,
 *   anchorY: 0.5,
 * });
 * node.addComponent(Layout, { centerX: 0, centerY: 0 });
 * ```
 */
export class Layout extends Component {
    private preferredWidth = 0;
    private preferredHeight = 0;
    private _markResize = false;
    private _active = false;
    private _applyingLayout = false;

    private resizeLater = onlyOnceQueueMicrotask(() => {
        if (!this._active || !this._markResize) {
            return;
        }
        this.resize();
    });

    private handleAdded = () => {
        this.gameObject.parent?.emitter.on(GameObject.Event.RESIZE, this.handleParentResize, this);
        this.markResize();
    };

    private handleRemoved = (parent: Group) => {
        parent.emitter.off(GameObject.Event.RESIZE, this.handleParentResize, this);
    };

    private handleParentResize = () => {
        this.markResize();
    };

    private handleSelfResize = () => {
        if (!this._applyingLayout) {
            this.savePreferredSize();
        }
        this.markResize();
    };

    private _left?: number;
    /**
     * 相对左边的距离
     */
    get left() {
        return this._left;
    }
    set left(val: number | undefined) {
        this._left = val;
        this.markResize();
    }

    private _top?: number;
    /**
     * 相对顶部的距离
     */
    get top() {
        return this._top;
    }
    set top(val: number | undefined) {
        this._top = val;
        this.markResize();
    }

    private _right?: number;
    /**
     * 相对右边的距离
     */
    get right() {
        return this._right;
    }
    set right(val: number | undefined) {
        this._right = val;
        this.markResize();
    }

    private _bottom?: number;
    /**
     * 相对底部的距离
     */
    get bottom() {
        return this._bottom;
    }
    set bottom(val: number | undefined) {
        this._bottom = val;
        this.markResize();
    }

    private _centerX?: number;

    /**
     * 水平居中偏移。
     * left 和 right 将失效
     * 注意：如果要让节点真正实现水平居中，需要设置 `anchorX`
     * ```ts
     * const node = GameObject.instantiate(Group, parent, { anchorX: 0.5 });
     * node.addComponent(Layout, { centerX: 0 });
     * ```
     */
    get centerX() {
        return this._centerX;
    }
    set centerX(val: number | undefined) {
        this._centerX = val;
        this.markResize();
    }

    private _centerY?: number;

    /**
     * 垂直居中偏移。
     * top 和 bottom 将失效
     * 注意：如果要让节点真正实现垂直居中，需要设置 `anchorY`
     * ```ts
     * const node = GameObject.instantiate(Group, parent, { anchorY: 0.5 });
     * node.addComponent(Layout, { centerY: 0 });
     * ```
     */
    get centerY() {
        return this._centerY;
    }
    set centerY(val: number | undefined) {
        this._centerY = val;
        this.markResize();
    }

    private _minWidth = 0;
    get minWidth() {
        return this._minWidth;
    }
    set minWidth(val: number) {
        this._minWidth = val;
        this.markResize();
    }

    private _minHeight = 0;
    get minHeight() {
        return this._minHeight;
    }
    set minHeight(val: number) {
        this._minHeight = val;
        this.markResize();
    }

    awake() {
        this._active = true;
        this.savePreferredSize();

        // 当父元素尺寸发生变化时触发
        this.gameObject.parent?.emitter.on(GameObject.Event.RESIZE, this.handleParentResize, this);

        // 当自身发生变化时触发
        this.gameObject.emitter.on(GameObject.Event.RESIZE, this.handleSelfResize, this);

        // 当自身被添加时时添加监听
        this.gameObject.emitter.on(GameObject.Event.ADDED, this.handleAdded, this);

        // 当自身被移除时移除监听
        this.gameObject.emitter.on(GameObject.Event.REMOVED, this.handleRemoved, this);

        this.resize();
    }

    private markResize() {
        this._markResize = true;
        if (this._active) {
            this.resizeLater();
        }
    }

    /**
     * 当挂载节点尺寸发生变化，且需要重新动态计算时调用
     * 将保存当前组件的位置和大小状态
     */
    saveNewSize() {
        this.savePreferredSize();
        this.resize();
    }

    private savePreferredSize() {
        this.preferredWidth = this.gameObject.width;
        this.preferredHeight = this.gameObject.height;
    }

    private clampWidth(width: number) {
        return Math.max(this.minWidth, width);
    }

    private clampHeight(height: number) {
        return Math.max(this.minHeight, height);
    }

    /**
     * 重新计算布局/矫正布局
     * ```ts
     * const node = new Transform();
     * const layout = node.addComponent(Layout);
     * node.anchor.set(0.5, 0.5);
     * layout.resize();
     * ```
     */
    /**
     * 矫正布局
     */
    public resize() {
        if (!this.gameObject.parent) {
            this._markResize = false;
            return;
        }
        const parent = this.gameObject.parent;
        let width = this.clampWidth(this.gameObject.width);
        let height = this.clampHeight(this.gameObject.height);
        let x = this.gameObject.x;
        let y = this.gameObject.y;

        if (this.centerX != undefined) {
            x = (parent.width - width) / 2 + this.centerX + this.gameObject.anchorX * width;
        } else if (this.left != undefined && this.right != undefined) {
            width = this.clampWidth(parent.width - this.left - this.right);
            x = this.left + this.gameObject.anchorX * width;
        } else if (this.left != undefined) {
            x = this.left + this.gameObject.anchorX * width;
        } else if (this.right != undefined) {
            width = this.clampWidth(this.preferredWidth);
            x = parent.width - this.right - width + this.gameObject.anchorX * width;
        }

        if (this.centerY != undefined) {
            y = (parent.height - height) / 2 + this.centerY + this.gameObject.anchorY * height;
        } else if (this.top != undefined && this.bottom != undefined) {
            height = this.clampHeight(parent.height - this.top - this.bottom);
            y = this.top + this.gameObject.anchorY * height;
        } else if (this.top != undefined) {
            y = this.top + this.gameObject.anchorY * height;
        } else if (this.bottom != undefined) {
            height = this.clampHeight(this.preferredHeight);
            y = parent.height - this.bottom - height + this.gameObject.anchorY * height;
        }

        this._applyingLayout = true;
        try {
            if (this.gameObject.width !== width) {
                this.gameObject.width = width;
            }
            if (this.gameObject.height !== height) {
                this.gameObject.height = height;
            }
            this.gameObject.transform.setPosition(x, y);
        } finally {
            this._applyingLayout = false;
            this._markResize = false;
        }
    }

    onDestroy(): void {
        this._active = false;
        this.gameObject.parent?.emitter.off(GameObject.Event.RESIZE, this.handleParentResize, this);
        this.gameObject.emitter.off(GameObject.Event.RESIZE, this.handleSelfResize, this);
        this.gameObject.emitter.off(GameObject.Event.ADDED, this.handleAdded, this);
        this.gameObject.emitter.off(GameObject.Event.REMOVED, this.handleRemoved, this);
    }
}
