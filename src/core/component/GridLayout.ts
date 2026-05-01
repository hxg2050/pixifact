import { GameObject } from "../GameObject";
import { Group } from "../group";
import { Component } from "./Component";

export class GridLayout extends Component<Group> {

    /**
     * 行数
     */
    private _row = 1;
    get row() {
        return this._row;
    }
    set row(val: number) {
        if (this._row === val) {
            return;
        }
        this._row = val;
        this._resize();

    }
    /**
     * 列数
     */
    col = 1;

    /**
     * 宽度
     */
    gridWidth = 1;
    /**
     * 高度
     */
    gridHeight = 1;

    /**
     * 行间距
     */
    gapVertical = 0;
    /**
     * 列间距
     */
    gapHorizontal = 0;

    private _refresh = true

    private handleChildAdded = () => {
        this._resize();
    }

    private handleChildRemoved = () => {
        this._resize();
    }

    awake(): void {
        this.gameObject.emitter.on(GameObject.Event.CHILD_ADDED, this.handleChildAdded, this)
        this.gameObject.emitter.on(GameObject.Event.CHILD_REMOVED, this.handleChildRemoved, this)
    }

    _resize() {
        this._refresh = true;
    }

    /**
     * 计算布局
     */
    resize() {
        const children = this.gameObject.children;

        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            child.width = this.gridWidth;
            child.height = this.gridHeight;

            const row = i % this.row;
            const col = Math.floor(i / this.row);

            // const gv = row === 0 ? 0 : this.gapVertical;
            // const gh = col === 0 ? 0 : this.gapHorizontal;

            child.transform.x = row * (this.gridWidth + this.gapVertical);
            child.transform.y = col * (this.gridHeight + this.gapHorizontal);
        }
        // if (this.gameObject.parent) {
        //     (this.gameObject.parent as Group).resize();
        //     console.log(this.gameObject.parent.width, this.gameObject.parent.height);
        // }
    }

    update(): void {
        if (!this._refresh) {
            return;
        }
        this._refresh = false;
        this.resize();
    }

    onDestroy(): void {
        this.gameObject.emitter.off(GameObject.Event.CHILD_ADDED, this.handleChildAdded, this)
        this.gameObject.emitter.off(GameObject.Event.CHILD_REMOVED, this.handleChildRemoved, this)
    }
}
