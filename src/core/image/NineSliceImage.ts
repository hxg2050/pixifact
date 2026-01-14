import { NineSliceSprite, Texture } from "pixi.js";
import { GameObject } from "../GameObject";
import { Group } from "../group";

export class NineSliceImage extends Group {
    private _texture = new Texture();

    display = new NineSliceSprite(this._texture);

    /**
     * 这两个参数主要用于解决从来没有执行过resize或没有宽高进行赋值的情况下，使用默认纹理的宽高进行配置
     */
    private _isSetWidth = false;
    private _isSetHeight = false;

    // get width() {
    //     return this.display.texture.orig.width;
    // }
    get width() {
        return this._width;
    }
    set width(val: number) {
        this._width = val;
        this._isSetWidth = true;
        this.display.width = val;
        this.refreshPivot();
        this.emitter.emit(GameObject.Event.RESIZE);
    }

    // get height() {
    //     return this.display.texture.orig.height;
    // }

    get height() {
        return this._height;
    }
    set height(val: number) {
        this._height = val;
        this._isSetHeight = true;
        this.display.height = val;
        this.refreshPivot();
        this.emitter.emit(GameObject.Event.RESIZE);
    }


    /**
     * 背景纹理
     */
    get texture() {
        return this.display.texture;
    }
    set texture(value: Texture) {
        this.display.texture = value;
        if (this._isSetWidth) {
            this.display.width = this.width;
        } else {
            this._width = this.display.width;
        }
        if (this._isSetHeight) {
            this.display.height = this.height;
        } else {
            this._height = this.display.height;
        }
    }

    resize() {
        this.width = this.display.texture.width;
        this.height = this.display.texture.height;
    }
}