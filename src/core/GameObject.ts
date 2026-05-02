import { Container } from "pixi.js";
import { Transform } from "./Transform";
import { Vector2 } from "@math.gl/core";
import EventEmitter from "eventemitter3";
import { setProps } from "./utils/setProps";
import { Component } from "./component/Component";
import type { Group } from "./group";
import type { Application } from "./Application";
export type Constructor<T = unknown> = new (...args: any[]) => T;

export const GameObjectEvent = {
    /**
     * 当添加到显示舞台时
     */
    ADDED: 'added',
    /**
     * 当添加新的子节点时
     */
    CHILD_ADDED: 'childAdded',

    /**
     * 移除时
     */
    REMOVED: 'removed',

    /**
     * 移除子元素时
     */
    CHILD_REMOVED: 'childRemoved',

    /**
     * 尺寸发生变化时
     */
    RESIZE: 'resize',
    /**
     * 位置发生变化
     */
    REPOSITION: 'reposition',

    /**
     * 帧刷新前
     */
    TICKER_BEFORE: 'tickerBefore',

    /**
     * 帧刷新后
     */
    TICKER_AFTER: 'tickerAfter'
} as const;

export interface GameObjectEventMap {
    [event: string]: any[];
    [GameObjectEvent.ADDED]: [parent: Group];
    [GameObjectEvent.CHILD_ADDED]: [child: GameObject];
    [GameObjectEvent.REMOVED]: [parent: Group];
    [GameObjectEvent.CHILD_REMOVED]: [child: GameObject];
    [GameObjectEvent.RESIZE]: [];
    [GameObjectEvent.REPOSITION]: [];
    [GameObjectEvent.TICKER_BEFORE]: [dt: number];
    [GameObjectEvent.TICKER_AFTER]: [dt: number];
}

function hasChildren(go: GameObject): go is GameObject & { children: GameObject[] } {
    return 'children' in go && Array.isArray(go.children);
}

class GameObjectEmitter extends EventEmitter<GameObjectEventMap> {
    constructor(private gameObject: GameObject) {
        super();
    }

    private syncUpdateRegistration() {
        this.gameObject.syncUpdateRegistration();
    }

    override on<T extends EventEmitter.EventNames<GameObjectEventMap>>(
        event: T,
        fn: EventEmitter.EventListener<GameObjectEventMap, T>,
        context?: unknown,
    ) {
        super.on(event, fn, context);
        this.syncUpdateRegistration();
        return this;
    }

    override addListener<T extends EventEmitter.EventNames<GameObjectEventMap>>(
        event: T,
        fn: EventEmitter.EventListener<GameObjectEventMap, T>,
        context?: unknown,
    ) {
        return this.on(event, fn, context);
    }

    override once<T extends EventEmitter.EventNames<GameObjectEventMap>>(
        event: T,
        fn: EventEmitter.EventListener<GameObjectEventMap, T>,
        context?: unknown,
    ) {
        super.once(event, fn, context);
        this.syncUpdateRegistration();
        return this;
    }

    override off<T extends EventEmitter.EventNames<GameObjectEventMap>>(
        event: T,
        fn?: EventEmitter.EventListener<GameObjectEventMap, T>,
        context?: unknown,
        once?: boolean,
    ) {
        super.off(event, fn, context, once);
        this.syncUpdateRegistration();
        return this;
    }

    override removeListener<T extends EventEmitter.EventNames<GameObjectEventMap>>(
        event: T,
        fn?: EventEmitter.EventListener<GameObjectEventMap, T>,
        context?: unknown,
        once?: boolean,
    ) {
        return this.off(event, fn, context, once);
    }

    override removeAllListeners(event?: EventEmitter.EventNames<GameObjectEventMap>) {
        super.removeAllListeners(event);
        this.syncUpdateRegistration();
        return this;
    }

    override emit<T extends EventEmitter.EventNames<GameObjectEventMap>>(
        event: T,
        ...args: EventEmitter.EventArgs<GameObjectEventMap, T>
    ) {
        const result = super.emit(event, ...args);
        if (event === GameObject.Event.TICKER_BEFORE || event === GameObject.Event.TICKER_AFTER) {
            this.syncUpdateRegistration();
        }
        return result;
    }
}

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

    static Event = GameObjectEvent;

    public emitter = new GameObjectEmitter(this);

    public display!: T;

    public transform: Transform = new Transform(this);
    public app?: Application;

    parent?: Group;

    public components: Component[] = [];
    private componentTickerHandlers = new Map<Component, (dt: number) => void>();
    private _destroying = false;

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

    public hasUpdateWork() {
        return !!this.update
            || this.emitter.listenerCount(GameObject.Event.TICKER_BEFORE) > 0
            || this.emitter.listenerCount(GameObject.Event.TICKER_AFTER) > 0;
    }

    public syncUpdateRegistration() {
        if (this._destroying || !this.app) {
            return;
        }

        if (this.hasUpdateWork()) {
            this.app.registerUpdateTarget(this);
        } else {
            this.app.unregisterUpdateTarget(this);
        }
    }

    public setApplication(app?: Application) {
        if (this.app === app) {
            return;
        }

        const previousApp = this.app;
        this.app = app;

        if (previousApp) {
            previousApp.unregisterUpdateTarget(this);
        }

        if (hasChildren(this)) {
            for (const child of this.children) {
                child.setApplication(app);
            }
        }

        if (app && this.hasUpdateWork()) {
            app.registerUpdateTarget(this);
        }
    }

    addComponent<T extends Component>(component: Constructor<T>, props?: Partial<T>): T {
        const _component = new component(this);
        this.components.push(_component);
    
        props && setProps(_component, props);
        _component.awake && _component.awake();

        if (_component.update) {
            let started = false;
            const tickerHandler = (dt: number) => {
                if (!started) {
                    started = true;
                    _component.start?.();
                }
                if (!this.components.includes(_component)) {
                    return;
                }
                _component.update?.(dt);
            };
            this.componentTickerHandlers.set(_component, tickerHandler);
            this.emitter.on(GameObject.Event.TICKER_BEFORE, tickerHandler, _component);
        } else if (_component.start) {
            const tickerHandler = () => {
                this.componentTickerHandlers.delete(_component);
                _component.start?.();
            };
            this.componentTickerHandlers.set(_component, tickerHandler);
            this.emitter.once(GameObject.Event.TICKER_BEFORE, tickerHandler, _component);
        }
        this.syncUpdateRegistration();
        
        return _component;
    }

    removeComponent<T extends Component>(component: T): T | undefined {
        const index = this.components.indexOf(component);
        if (index == -1) {
            return;
        }
        this.components.splice(index, 1);
        const tickerHandler = this.componentTickerHandlers.get(component);
        if (tickerHandler) {
            this.emitter.off(GameObject.Event.TICKER_BEFORE, tickerHandler, component);
            this.componentTickerHandlers.delete(component);
        }
        component.gameObject.display.off('destroyed', component.destroy, component);
        component.onDestroy && component.onDestroy();
        this.syncUpdateRegistration();
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
        if (this.start) {
            if (this.display.parent) {
                this.start.call(this);
            } else {
                this.display.once('added', this.start, this);
            }
        }

        this.display.once('destroyed', () => {
            this._destroying = true;
            this.setApplication(undefined);
            queueMicrotask(() => {
                this.emitter.removeAllListeners();
            });
        });
    }

    public update?(dt: number): void;

    public render?(): void;

    public onDestroy?(): void;

    // destroy() {
    //     this.parent?.removeChild(this);
    //     this.onDestroy && this.onDestroy();
    // }

    static instantiate<T extends GameObject = GameObject>(gameObject: Constructor<T>, parent?: Group, props?: Partial<T>): T {
        const go = new gameObject();
        props && setProps(go, props);
        go.setDisplay(go.display);
        go.render?.();
        parent?.addChild(go);

        return go;
    }

    static async destroy(go: GameObject) {
        go._destroying = true;
        go.setApplication(undefined);
        if (hasChildren(go)) {
            for (let i = go.children.length - 1; i >= 0; i--) {
                GameObject.destroy(go.children[i]);
            }
        }
        go.parent?.removeChild(go);
        go.onDestroy && go.onDestroy();
        go.display.destroy();
        go.emitter.removeAllListeners();
        go.components.length = 0;
    }
}
