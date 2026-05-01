import { GameObject } from "../GameObject";
import { Group } from "../group";
import { onlyOnceQueueMicrotask } from "../utils/onlyOnceQueueMicrotask";
import { Component } from "./Component";
import { Flex } from "./Flex";


export enum FlexDirection {
    ROW,
    COLUMN
}
export class FlexGroup extends Component<Group> {
    private _active = false;
    private _applyingLayout = false;

    private _direction: FlexDirection = FlexDirection.ROW;
    get direction() {
        return this._direction;
    }
    set direction(val: FlexDirection) {
        if (this._direction === val) {
            return;
        }
        this._direction = val;
        this.markResize();
    }

    private _gap = 0;
    get gap() {
        return this._gap;
    }
    set gap(val: number) {
        if (this._gap === val) {
            return;
        }
        this._gap = val;
        this.markResize();
    }

    awake(): void {
        this._active = true;
        this.gameObject.emitter.on(GameObject.Event.RESIZE, this.handleResize, this);
        this.gameObject.emitter.on(GameObject.Event.CHILD_ADDED, this.handleChildAdded, this);
        this.gameObject.emitter.on(GameObject.Event.CHILD_REMOVED, this.handleChildRemoved, this);
        for (const child of this.gameObject.children) {
            this.bindChild(child);
        }
        this.resize();
    }

    private handleResize = () => {
        this.markResize();
    };

    private handleChildAdded = (child: GameObject) => {
        this.bindChild(child);
        this.markResize();
    };

    private handleChildRemoved = (child: GameObject) => {
        this.unbindChild(child);
        this.markResize();
    };

    private handleChildResize = () => {
        if (this._applyingLayout) {
            return;
        }
        this.markResize();
    };

    private bindChild(child: GameObject) {
        child.emitter.on(GameObject.Event.RESIZE, this.handleChildResize, this);
    }

    private unbindChild(child: GameObject) {
        child.emitter.off(GameObject.Event.RESIZE, this.handleChildResize, this);
    }

    private markResize() {
        if (this._active) {
            this.resize();
        }
    }

    resize = onlyOnceQueueMicrotask(() => {
        if (!this._active && !this.gameObject.display) {
            return;
        }
        const length = this.gameObject.children.length;
        if (length === 0) {
            return;
        }

        const isRow = this.direction === FlexDirection.ROW;
        let total = 0;
        let fixedSize = Math.max(0, length - 1) * this.gap;

        for (let i = 0; i < length; i ++) {
            const child = this.gameObject.getChildAt(i);
            const flex = child.getComponent(Flex);

            if (flex && flex.grow > 0) {
                total += flex.grow;
            } else {
                fixedSize += isRow ? child.width : child.height;
            }
        }

        // 起始位置
        let location = 0;
        // 可用空间
        const available = Math.max(0, (isRow ? this.gameObject.width : this.gameObject.height) - fixedSize);

        this._applyingLayout = true;
        try {
            for (let i = 0; i < length; i ++) {
                const child = this.gameObject.getChildAt(i);
                const flex = child.getComponent(Flex);

                const perc = flex && flex.grow > 0 && total > 0 ? flex.grow / total : 0;
                
                if (isRow) {
                    child.x = location;
                    if (perc) {
                        child.width = available  * perc;
                    }
                    location += child.width;
                } else {
                    child.y = location;
                    if (perc) {
                        child.height = available * perc;
                    }
                    location += child.height;
                }

                if (i < length - 1) {
                    location += this.gap;
                }
            }
        } finally {
            this._applyingLayout = false;
        }
    })

    onDestroy(): void {
        this._active = false;
        this.gameObject.emitter.off(GameObject.Event.RESIZE, this.handleResize, this);
        this.gameObject.emitter.off(GameObject.Event.CHILD_ADDED, this.handleChildAdded, this);
        this.gameObject.emitter.off(GameObject.Event.CHILD_REMOVED, this.handleChildRemoved, this);
        for (const child of this.gameObject.children) {
            this.unbindChild(child);
        }
    }
}
