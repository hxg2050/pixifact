import { Container } from "pixi.js";
import { GameObject } from "../GameObject";

export class Group extends GameObject<Container> {
    display = new Container();

    protected _width: number = 0;
    protected _height: number = 0;

    get width() {
        return this._width;
    }
    set width(val: number) {
        this._width = val;
        this.refreshPivot();
        this.emitter.emit(GameObject.Event.RESIZE);
    }

    get height() {
        return this._height;
    }
    set height(val: number) {
        this._height = val;
        this.refreshPivot();
        this.emitter.emit(GameObject.Event.RESIZE);
    }

    resize() {
        const bound = this.display.getBounds();
        console.log(bound)
        for (let i = 0; i < this.display.children.length; i++) {
            console.log(this.display.children[i].x, this.display.children[i].y)
        }
        this.width = bound.width;
        this.height = bound.height;
    }

    getChildAt(index: number) {
        if (index < 0 || index >= this.children.length) {
            throw new Error(`getChildAt: Index (${index}) does not exist.`);
        }
        return this.children[index];
    }

    /**
     * 插入一个子节点
     * @param transform - 待插入的节点
     */
    addChild(child: GameObject) {
        if (child.parent) {
            (child.parent as Group).removeChild(child);
        }
        this.children.push(child);
        child.parent = this;
        this.display.addChild(child.display);

        this.emitter.emit(Group.Event.CHILD_ADDED, child);
        child.emitter.emit(Group.Event.ADDED, this);

        return child;
    }

    /**
     * 在指定位置插入节点
     * @param child - 待插入的节点
     * @param index - 要插入的位置
     */
    addChildAt(child: Group, index: number) {
        if (child.parent) {
            (child.parent as Group).removeChild(child);
        }
        this.children.splice(index, 0, child);
        child.parent = this;
        this.display.addChildAt(child.display, index);


        this.emitter.emit(GameObject.Event.CHILD_ADDED, child);
        child.emitter.emit(GameObject.Event.ADDED, this);

        return child;
    }

    /**
     * 移除一个节点
     * @param transform - 将要移除的节点
     */
    removeChild(child: GameObject) {
        let index = this.children.indexOf(child);
        if (index == -1) {
            return;
        }

        this.removeChildAt(index);
    }

    /**
     * 移除一个指定位置的元素
     * @param index - 要移除节点的位置
     */
    removeChildAt(index: number) {
        const node = this.children.splice(index, 1)[0];
        node.parent = undefined;
        node.display.parent.removeChildAt(index);

        this.emitter.emit(GameObject.Event.CHILD_REMOVED, node);
        node.emitter.emit(GameObject.Event.REMOVED, this);

        return node;
    }

    /**
     * 移除所有子元素
     */
    removeChildren() {
        if (this.children.length == 0) {
            this.display.removeChildren();
            return;
        }
        this.removeChildAt(0);
        this.removeChildren();
    }

}