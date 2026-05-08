import { Component } from "./Component";
import { GameObject } from "../GameObject";

export class Flex extends Component {
    private _grow = 1;
    get grow() {
        return this._grow;
    }
    set grow(val: number) {
        if (this._grow === val) {
            return;
        }
        this._grow = val;
        this.gameObject.parent?.emitter.emit(GameObject.Event.RESIZE);
    }
}
