import { Container } from "pixi.js";
import { GameObject } from "../GameObject";

export class Group extends GameObject<Container> {
    display = new Container();

    protected _width: number = 0;
    protected _height: number = 0;
    children: GameObject[] = [];

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
     * @param child - 待插入的节点
     */
    addChild(child: GameObject) {
        child.parent?.removeChild(child);
        this.children.push(child);
        child.parent = this;
        this.display.addChild(child.display);

        this.emitter.emit(GameObject.Event.CHILD_ADDED, child);
        child.emitter.emit(GameObject.Event.ADDED, this);

        return child;
    }

    /**
     * 在指定位置插入节点
     * @param child - 待插入的节点
     * @param index - 要插入的位置
     */
    addChildAt(child: GameObject, index: number) {
        if (index < 0 || index > this.children.length) {
            throw new Error(`addChildAt: Index (${index}) is out of bounds.`);
        }

        child.parent?.removeChild(child);
        this.children.splice(index, 0, child);
        child.parent = this;
        this.display.addChildAt(child.display, index);

        this.emitter.emit(GameObject.Event.CHILD_ADDED, child);
        child.emitter.emit(GameObject.Event.ADDED, this);

        return child;
    }

    /**
     * 移除一个节点
     * @param child - 将要移除的节点
     */
    removeChild(child: GameObject) {
        const index = this.children.indexOf(child);
        if (index === -1) {
            return;
        }

        return this.removeChildAt(index);
    }

    /**
     * 移除一个指定位置的元素
     * @param index - 要移除节点的位置
     */
    removeChildAt(index: number) {
        if (index < 0 || index >= this.children.length) {
            throw new Error(`removeChildAt: Index (${index}) does not exist.`);
        }

        const node = this.children.splice(index, 1)[0];
        node.parent = undefined;
        node.display.parent?.removeChild(node.display);

        this.emitter.emit(GameObject.Event.CHILD_REMOVED, node);
        node.emitter.emit(GameObject.Event.REMOVED, this);

        return node;
    }

    /**
     * 移除所有子元素
     */
    removeChildren() {
        while (this.children.length > 0) {
            this.removeChildAt(0);
        }
    }

}
