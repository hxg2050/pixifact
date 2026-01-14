import { StrokeStyle, Ticker, Graphics as PIXIGraphics } from "pixi.js";
import { GameObject, Graphics, Group, Label, LabelStyle } from "../core";

export class Input extends Group {
    /**
     * 背景样式
     */
    public graphics!: Graphics;
    /**
     * 使用html标签进行输入处理
     */
    public element!: HTMLTextAreaElement | HTMLInputElement;
    /**
     * 输入框失去焦点时显示的内容
     */
    public value!: Label;

    private _mask!: PIXIGraphics;

    set width(val: number) {
        super.width = val;
        this._isResize = true;
    }
    get width() {
        return super.width;
    }

    set height(val: number) {
        super.height = val;
        this._isResize = true;
    }
    get height() {
        return super.height
    }

    set x(val: number) {
        super.x = val;
        this._isUpdateTransform = true;
    }
    get x() {
        return super.x;
    }

    set y(val: number) {
        super.y = val;
        this._isUpdateTransform = true;
    }
    get y() {
        return super.y
    }

    set scaleX(val: number) {
        super.scaleX = val;
        this._isUpdateTransform = true;
    }
    get scaleX() {
        return super.scaleX
    }

    set scaleY(val: number) {
        super.scaleY = val;
        this._isUpdateTransform = true;
    }
    get scaleY() {
        return super.scaleY
    }
    
    /**
     * 更新mask，条件：1、padding改变 2、宽高改变
     */
    protected updateMask() {
        this._mask.height = this.height - this.paddingTop;
        this._mask.width = this.width - this.paddingLeft;
    }

    protected _isUpdateElementSize = false;
    protected updateElementSize() {
        this._isUpdateElementSize = false;
        this.element.style.width = this.width + 'px'
        this.element.style.height = this.height + 'px'
        this.element.style.borderWidth = this._padding.join('px ') + 'px'
        this.element.style.fontSize = this.fontSize + 'px'
        this.updateMask();
    }

    private _isUpdateTransform = false;
    /**
     * 更新2d变换，位置，缩放，斜切，旋转
     */
    updateTransform() {
        this._isUpdateTransform = false;
        const { a, b, c, d, tx, ty } = this.display.worldTransform;
        this.element.style.transform = `matrix(${a}, ${b}, ${c}, ${d}, ${tx}, ${ty})`
        this.element.style.transformOrigin = `${this.anchorX}% ${this.anchorY}%`;
        this.updateMask();
    }

    protected _isResize = false;
    /**
     * 更新大小
     */
    public resize(): void {
        this._isResize = false;
        this._isUpdateElementSize = true;
        this.value.x = this.paddingLeft;
        this.value.y = this.paddingTop;
        this._labelStyle.lineHeight = this.height;
        this.updateMask();
    }

    protected createElement() {
        this.element = document.createElement('input')
    }

    public render() {
        const mask = new PIXIGraphics();
        mask.rect(0, 0, 100, 50)
        mask.fill(0x0000ff);
        this.display.addChild(mask);
        this._mask = mask;
        this.createElement();
        this.element.setAttribute('type', 'text');
        this.element.className = 'textarea'
        this.element.style.display = 'none';
        this.element.onfocus = this.onFocus.bind(this);
        this.element.onblur = this.onBlur.bind(this);
        
        this.fontFamily = this._labelStyle.fontFamily;
        this.fontSize = this._labelStyle.fontSize;

        window.document.body.append(this.element);
        this.graphics = GameObject.instantiate(Graphics, this)
        this.value = GameObject.instantiate(Label, this, {
            style: this._labelStyle,
            x: this.paddingLeft
        })
        this.value.display.mask = mask;


        this.graphics.display.eventMode = 'static';
        this.graphics.display.on('pointerdown', this.focus, this)
    }

    public update(): void {
        if (this._isUpdateTransform) {
            this.updateTransform();
        }
        if (this._isResize) {
            this.resize();
        }
        if (this._isDrawStyle) {
            this.drawStyle();
        }
        if (this._isUpdateElementSize) {
            this.updateElementSize();
        }
    }

    private _stokeStyle: StrokeStyle = { width: 1, color: 0x828282 }

    private _backgroundColor = 0xffffff;
    set backgroundColor(val: number) {
        this._backgroundColor = val
        this._isDrawStyle = true;
    }

    set borderColor(val: number) {
        this._stokeStyle.color = val;
        this._isDrawStyle = true;
    }

    set borderSize(val: number) {
        this._stokeStyle.width = val;
        this._isDrawStyle = true;
    }

    protected _labelStyle = new LabelStyle({
        fontSize: 16,
        lineHeight: 16
    })
    set fontFamily(val: string | string[]) {
        this._labelStyle.fontFamily = val;
        this.element.style.fontFamily = Array.isArray(val) ? val.join(',') : val;
    }
    get fontFamily() {
        return this._labelStyle.fontFamily;
    }

    set fontSize(val: number) {
        this._labelStyle.fontSize = val;
        this.element.style.fontSize = val + 'px';
    }
    get fontSize() {
        return this._labelStyle.fontSize;
    }

    private _isDrawStyle = true;
    /**
     * 绘制背景样式
     */
    public drawStyle() {
        this._isDrawStyle = false;
        this.graphics.clear();
        this.graphics.rect(0, 0, this.width, this.height);
        this.graphics.fill(this._backgroundColor)
        this.graphics.stroke(this._stokeStyle);
    }

    protected _padding = [0, 6, 0, 6];
    set paddingLeft(val: number) {
        this._padding[3] = val;
        this._isResize = true;
        this._isUpdateElementSize = true;
    }
    get paddingLeft() {
        return this._padding[3];
    }

    set paddingRight(val: number) {
        this._padding[1] = val;
        this._isResize = true;
        this._isUpdateElementSize = true;
    }
    get paddinRight() {
        return this._padding[1];
    }

    set paddingTop(val: number) {
        this._padding[0] = val;
        this._isResize = true;
        this._isUpdateElementSize = true;
    }
    get paddingTop() {
        return this._padding[0]
    }
    
    set paddingBottom(val: number) {
        this._padding[2] = val;
        this._isResize = true;
        this._isUpdateElementSize = true;
    }
    get paddingBottom() {
        return this._padding[2]
    }
    

    private onFocus() {
        console.log('focus');
        this.value.display.visible = false
        this.borderColor = 0x0000ff;
        this.borderSize = 2
        this.emitter.emit('focus');
    }
    public focus() {
        console.log('f');
        this.element.style.display = 'block';
        Ticker.shared.addOnce(() => {
            this.element.focus()
        })
    }

    private onBlur() {
        console.log('blur');
        this.borderColor = 0x828282;
        this.borderSize = 1
        this.element.style.display = 'none';
        this.value.value = this.element.value;
        this.value.display.visible = true
        this.emitter.emit('blur');
    }
    public blur() {
        this.element.blur()
    }
}