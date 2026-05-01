import { Container, Ticker } from "pixi.js";
import { Transform } from "./Transform";
import { Vector2 } from "@math.gl/core";
import EventEmitter from "eventemitter3";
import { setProps } from "./utils/setProps";
import { Group } from "./group";
import { Component } from "./component/Component";
export type Constructor<T = unknown> = new (...args: any[]) => T;

export type ValueOf<T extends {} = {}> = T[keyof T];

export type GameObjectEvent = ValueOf<typeof GameObject.Event>;

export abstract class BaseGameObject<T extends Container> {
    public abstract display: T;

    abstract get width(): number;
    abstract set width(val: number);

    abstract get height(): number;
    abstract set height(val: number);

    abstract get anchor(): Vector2;
    abstract set anchor(val: Vector2);

    protected refreshPivot() {
        // console.log(Object.getPrototypeOf(this));
        // console.log(this.width);
        this.display.pivot.x = this.width * this.anchor.x;
        this.display.pivot.y = this.height * this.anchor.y;
    }
}

export abstract class GameObject<T extends Container = Container> extends BaseGameObject<T> {

    static Event = {
        /**
         * 当添加到显示舞台时
         */
        ADDED: 'ADDED',
        /**
         * 当添加新的字节点时
         */
        CHILD_ADDED: 'CHILD_ADDED',

        /**
         * 移除时
         */
        REMOVED: 'REMOVED',

        /**
         * 移除子元素时
         */
        CHILD_REMOVED: 'CHILD_REMOVED',

        /**
         * 尺寸发生变化时
         */
        RESIZE: 'RESIZE',
        /**
         * 位置发生变化
         */
        REPOSITION: 'REPOSITION',

        /**
         * 帧刷新前
         */
        TICKER_BEFORE: 'TICKER_BEFORE',

        /**
         * 帧刷新后
         */
        TICKER_AFTER: 'TICKER_AFTER'
    }

    public emitter = new EventEmitter<GameObjectEvent>();

    public display!: T;

    public transform: Transform = new Transform(this);

    parent?: Group;

    public components: Component[] = [];

    children: GameObject[] = [];

    get visible() {
        return this.display.visible;
    }
    set visible(val: boolean) {
        this.display.visible = val;
    }

    get x() {
        return this.transform.x;
    }
    set x(val: number) {
        this.transform.x = val;
    }

    get y() {
        return this.transform.y;
    }
    set y(val: number) {
        this.transform.y = val;
    }

    get scaleX() {
        return this.transform.scaleX;
    }
    set scaleX(val: number) {
        this.transform.scaleX = val;
    }

    get scaleY() {
        return this.transform.scaleY;
    }
    set scaleY(val: number) {
        this.transform.scaleY = val;
    }

    get width() {
        return this.display.width;
    }
    set width(val: number) {
        this.display.width = val;
        this.refreshPivot();
        this.emitter.emit(GameObject.Event.RESIZE);
    }

    get height() {
        return this.display.height;
    }
    set height(val: number) {
        this.display.height = val;
        this.refreshPivot();
        this.emitter.emit(GameObject.Event.RESIZE);
    }

    protected _anchor = new Vector2();
    get anchor() {
        return this._anchor;
    }
    set anchor(value: Vector2) {
        this.anchorX = value.x;
        this.anchorY = value.y;
    }

    get anchorX() {
        return this._anchor.x;
    }
    set anchorX(value: number) {
        this.anchor.x = value;
        this.refreshPivot();
    }

    get anchorY() {
        return this._anchor.y;
    }
    set anchorY(value: number) {
        this.anchor.y = value;
        this.refreshPivot();
    }

    get rotation() {
        return this.transform.rotation;
    }
    set rotation(val: number) {
        this.transform.rotation = val;
    }

    get skewX() {
        return this.transform.skewX;
    }
    set skewX(val: number) {
        this.transform.skewX = val;
    }

    get skewY() {
        return this.transform.skewY;
    }
    set skewY(val: number) {
        this.transform.skewY = val;
    }


    /**
     * 透明度
     */
    get alpha() {
        return this.display.alpha;
    }
    set alpha(val: number) {
        this.display.alpha = val;
    }

    start?(): void;

    addComponent<T extends Component>(component: Constructor<T>, props?: Partial<T>): T {
        const _component = new component(this);
        this.components.push(_component);
    
        _component.awake && _component.awake();
        _component.start && this.emitter.once(GameObject.Event.TICKER_BEFORE, _component.start, _component);
        _component.update && this.emitter.on(GameObject.Event.TICKER_BEFORE, _component.update, _component);
        props && setProps(_component, props);
        
        return _component;
    }

    removeComponent<T extends Component>(component: T): T | undefined {
        const index = this.components.indexOf(component);
        if (index == -1) {
            return;
        }
        this.components.splice(index, 1);
        component.start && this.emitter.off(GameObject.Event.TICKER_BEFORE, component.start, component);
        component.update && this.emitter.off(GameObject.Event.TICKER_BEFORE, component.update, component);
        component.gameObject.display.off('destroyed', component.destroy, component);
        component.onDestroy && component.onDestroy();
        return component;
    }

    getComponent<T extends Component>(component: Constructor<T>): T | undefined {
        return this.components.find(val => val instanceof component) as T;
    }

    getComponents<T extends Component>(component: Constructor<T>): T[] | undefined {
        return this.components.filter(val => val instanceof component) as T[];
    }
    
    private setDisplay(display: T) {
        this.display = display;
        this.start && this.display.once('added', this.start, this);
        // this.onDestroy && this.display.once('destroyed', this.onDestroy);
    }

    public update?(dt: number): void;

    public render?(): void;

    public onDestroy?(): void;

    // destroy() {
    //     this.parent?.removeChild(this);
    //     this.onDestroy && this.onDestroy();
    // }

    static instantiate<T extends GameObject = GameObject>(gameObject: Constructor<T>, parent?: GameObject, props?: Partial<T>): T {
        const go = new gameObject();
        go.render?.();
        go.setDisplay(go.display);
        (parent as Group)?.addChild(go);
        props && setProps(go, props);

        // if (go.update) {
            const update = (ticker: Ticker) => {
                const dt = ticker.deltaTime;
                go.emitter.emit(GameObject.Event.TICKER_BEFORE, dt);
                go.update?.(dt);
                go.emitter.emit(GameObject.Event.TICKER_AFTER, dt);
            }
            Ticker.shared.add(update);
            go.display.once('destroyed', () => {
                Ticker.shared.remove(update);
            });
        // }

        return go;
    }

    static async destroy(go: GameObject) {
        // console.log(go.children);
        for (let i = go.children.length - 1; i >= 0; i--) {
            GameObject.destroy(go.children[i]);
        }
        (go.parent as Group)?.removeChild(go);
        go.onDestroy && go.onDestroy();
        go.display.destroy();
    }
}
