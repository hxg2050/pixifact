import { GameObject } from "../GameObject";

export abstract class Component<T extends GameObject = GameObject> {
    constructor(public gameObject: T) {
        gameObject.display.on('destroyed', this.destroy, this)
    }

    awake?(): void;

    start?(): void;

    update?(_dt: number): void;

    /**
     * 销毁组件
     */
    destroy() {
        this.gameObject.removeComponent(this);
    }

    onDestroy?(): void;
}
