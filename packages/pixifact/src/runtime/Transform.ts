import { Vector2 } from '@math.gl/core'
import { GameObjectEvent } from './GameObjectEvent';
import type { GameObject } from './GameObject';
export class Transform {
    // x: number;
    // y: number;
    // width: number;
    // height: number;
    // scaleX: number;
    // scaleY: number;

    constructor(public gameObject: GameObject) {

    }

    private _position = new Vector2(0, 0);
    get position() {
        return this._position;
    }
    set position(val: Vector2) {
        this.setPosition(val.x, val.y);
    }

    get x() {
        return this.position.x;
    }
    set x(val: number) {
        this.setPosition(val, this.position.y);
    }

    get y() {
        return this.position.y;
    }
    set y(val: number) {
        this.setPosition(this.position.x, val);
    }

    public setPosition(x: number, y: number) {
        const displayPosition = this.gameObject.display?.position;
        const isPositionChanged = this.position.x !== x || this.position.y !== y;
        const isDisplayPositionChanged = displayPosition
            ? displayPosition.x !== x || displayPosition.y !== y
            : false;

        if (!isPositionChanged && !isDisplayPositionChanged) {
            return;
        }

        this.position.set(x, y);
        if (displayPosition) {
            displayPosition.set(x, y);
        }
        this.emitTransformChange();
        this.gameObject.emitter.emit(GameObjectEvent.REPOSITION);
    }

    private emitTransformChange() {
        this.gameObject.emitter.emit(GameObjectEvent.TRANSFORM_CHANGE);
    }

    // private _size = new Vector2();
    // get size() {
    //     return this._size;
    // }
    // set size(val: Vector2) {
    //     this.width = val.x;
    //     this.height = val.y;
    // }

    // get width() {
    //     return this.size.x;
    // }
    // set width(val: number) {
    //     this.size.x = val;
    //     // this.gameObject.display.scale.x = this.scale.x;
    //     // this.gameObject.display.width = this.size.x;
    //     // this.gameObject.display.scale.x = this.scale.x;

    // }

    // get height() {
    //     return this.size.y;
    // }
    // set height(val: number) {
    //     this.size.y = val;
    //     this.gameObject.display.height = this.size.y * this.scale.y;
    // }

    private _scale: Vector2 = new Vector2(1, 1);
    get scale() {
        return this._scale;
    }
    set scale(val: Vector2) {
        this.scaleX = val.x;
        this.scaleY = val.y;
    }

    get scaleX() {
        return this.scale.x;
    }
    set scaleX(val: number) {
        if (this.scale.x === val && this.gameObject.display.scale.x === val) {
            return;
        }
        this.scale.x = val;
        this.gameObject.display.scale.x = this.scale.x;
        this.emitTransformChange();
    }

    get scaleY() {
        return this.scale.y;
    }
    set scaleY(val: number) {
        if (this.scale.y === val && this.gameObject.display.scale.y === val) {
            return;
        }
        this.scale.y = val;
        this.gameObject.display.scale.y = this.scale.y;
        this.emitTransformChange();
    }

    get pivotX() {
        return this.gameObject.display.pivot.x;
    }
    set pivotX(val: number) {
        if (this.gameObject.display.pivot.x === val) {
            return;
        }
        this.gameObject.display.pivot.x = val;
        this.emitTransformChange();
    }

    get pivotY() {
        return this.gameObject.display.pivot.y;
    }
    set pivotY(val: number) {
        if (this.gameObject.display.pivot.y === val) {
            return;
        }
        this.gameObject.display.pivot.y = val;
        this.emitTransformChange();
    }
    // this.label.display.transform.pivot.set(-50, 0);


    get rotation() {
        return this.gameObject.display.rotation;
    }
    set rotation(val: number) {
        if (this.gameObject.display.rotation === val) {
            return;
        }
        this.gameObject.display.rotation = val;
        this.emitTransformChange();
    }

    get skewX() {
        return this.gameObject.display.skew.x;
    }
    set skewX(val: number) {
        if (this.gameObject.display.skew.x === val) {
            return;
        }
        this.gameObject.display.skew.x = val;
        this.emitTransformChange();
    }

    get skewY() {
        return this.gameObject.display.skew.y;
    }
    set skewY(val: number) {
        if (this.gameObject.display.skew.y === val) {
            return;
        }
        this.gameObject.display.skew.y = val;
        this.emitTransformChange();
    }

    // worldPosition() {
    //     this.gameObject.display.worldTransform.
    // }
}
