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
    public valueLabel!: Label;
    /**
     * HTML 输入元素对齐的 canvas。默认取文档中的第一个 canvas。
     */
    public canvas?: Element;

    private _mask!: PIXIGraphics;
    private _value = '';
    private _destroyed = false;
    private _isFocused = false;
    private _textColor = '#23272a';
    private _focusedBorderColor = 0x0000ff;
    private _blurredBorderColor = 0x828282;
    protected _isUpdateTransform = false;

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
        if (!this._mask) {
            return;
        }

        this._mask.x = this.paddingLeft;
        this._mask.y = this.paddingTop;
        this._mask.width = this.contentWidth;
        this._mask.height = this.contentHeight;
    }

    protected _isUpdateElementSize = false;
    protected updateElementSize() {
        this._isUpdateElementSize = false;
        this.element.style.width = this.width + 'px';
        this.element.style.height = this.height + 'px';
        this.element.style.padding = this._padding.map((value) => value + 'px').join(' ');
        this.element.style.borderWidth = '0';
        this.element.style.fontSize = this.fontSize + 'px';
        this.element.style.lineHeight = this.contentHeight + 'px';
        this.updateMask();
    }

    /**
     * 更新2d变换，位置，缩放，斜切，旋转
     */
    updateTransform() {
        const { a, b, c, d, tx, ty } = this.display.worldTransform;
        const offset = this.getCanvasOffset();
        this.element.style.transform = `matrix(${a}, ${b}, ${c}, ${d}, ${tx + offset.x}, ${ty + offset.y})`;
        this.element.style.transformOrigin = `${this.anchorX * 100}% ${this.anchorY * 100}%`;
        this.element.style.opacity = String(this.display.alpha);
        this._isUpdateTransform = false;
        this.updateMask();
    }

    private getCanvasOffset() {
        const view = this.getCanvasView();
        if (!view) {
            return { x: 0, y: 0 };
        }

        const rect = view.getBoundingClientRect();
        return { x: rect.left, y: rect.top };
    }

    private getCanvasView(): Element | undefined {
        return this.canvas ?? document.querySelector('canvas') ?? undefined;
    }

    protected _isResize = false;
    /**
     * 更新大小
     */
    public resize(): void {
        this._isResize = false;
        this._isUpdateElementSize = true;
        this._isUpdateTransform = true;
        this.valueLabel.x = this.paddingLeft;
        this.valueLabel.y = this.paddingTop;
        this._labelStyle.lineHeight = this.contentHeight;
        this.updateMask();
    }

    protected createElement() {
        const element = document.createElement('input');
        element.type = 'text';
        this.element = element;
    }

    public render() {
        const mask = new PIXIGraphics();
        mask.rect(0, 0, 100, 50);
        mask.fill(0x0000ff);
        this.display.addChild(mask);
        this._mask = mask;

        this.createElement();
        this.element.className = 'textarea';
        this.element.style.boxSizing = 'border-box';
        this.element.style.position = 'fixed';
        this.element.style.left = '0';
        this.element.style.top = '0';
        this.element.style.zIndex = '10';
        this.element.style.margin = '0';
        this.element.style.borderStyle = 'solid';
        this.element.style.borderRadius = '0';
        this.element.style.display = 'none';
        this.element.style.color = 'transparent';
        this.element.style.background = 'transparent';
        this.element.style.caretColor = this._textColor;
        this.element.style.outline = 'none';
        this.element.style.padding = '0 6px';
        this.element.style.fontFamily = Array.isArray(this._labelStyle.fontFamily)
            ? this._labelStyle.fontFamily.join(',')
            : this._labelStyle.fontFamily;
        this.element.style.fontSize = this._labelStyle.fontSize + 'px';
        this.element.onfocus = this.onFocus.bind(this);
        this.element.onblur = this.onBlur.bind(this);
        this.element.oninput = this.onInput.bind(this);
        
        this.fontFamily = this._labelStyle.fontFamily;
        this.fontSize = this._labelStyle.fontSize;

        window.document.body.append(this.element);
        this.graphics = GameObject.instantiate(Graphics, this);
        this.valueLabel = GameObject.instantiate(Label, this, {
            style: this._labelStyle,
            x: this.paddingLeft
        });
        this.valueLabel.display.mask = mask;
        this.value = this._value;


        this.graphics.display.eventMode = 'static';
        this.graphics.display.on('pointerdown', this.focus, this);
        this.display.once('destroyed', this.onDestroy, this);
        window.addEventListener('resize', this.handleViewportChange);
        window.addEventListener('scroll', this.handleViewportChange, true);
        this._isResize = true;
        this._isDrawStyle = true;
        this._isUpdateElementSize = true;
        this._isUpdateTransform = true;
    }

    public update(): void {
        if (this._isResize) {
            this.resize();
        }
        if (this._isDrawStyle) {
            this.drawStyle();
        }
        if (this._isUpdateElementSize) {
            this.updateElementSize();
        }
        if (this._isUpdateTransform || this.element.style.display !== 'none') {
            this.updateTransform();
        }
    }

    private handleViewportChange = () => {
        this._isUpdateTransform = true;
    };

    private _stokeStyle: StrokeStyle = { width: 1, color: this._blurredBorderColor }

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
        if (this.element) {
            this.element.style.fontFamily = Array.isArray(val) ? val.join(',') : val;
        }
    }
    get fontFamily() {
        return this._labelStyle.fontFamily;
    }

    set fontSize(val: number) {
        this._labelStyle.fontSize = val;
        if (this.element) {
            this.element.style.fontSize = val + 'px';
        }
        this._isUpdateElementSize = true;
        this._isUpdateTransform = true;
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
        this.graphics.fill(this._backgroundColor);
        this.graphics.stroke(this._stokeStyle);
    }

    protected _padding = [0, 6, 0, 6];
    protected get contentWidth() {
        return Math.max(0, this.width - this.paddingLeft - this.paddingRight);
    }

    protected get contentHeight() {
        return Math.max(0, this.height - this.paddingTop - this.paddingBottom);
    }

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
    get paddingRight() {
        return this._padding[1];
    }
    /**
     * @deprecated 使用 `paddingRight`。该拼写错误保留用于兼容旧代码。
     */
    get paddinRight() {
        return this.paddingRight;
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

    get value() {
        return this._value;
    }
    set value(val: string) {
        this._value = val;
        if (this.element && this.element.value !== val) {
            this.element.value = val;
        }
        if (this.valueLabel) {
            this.valueLabel.value = val;
        }
    }

    private onFocus() {
        this._isFocused = true;
        this.valueLabel.display.visible = false;
        this.element.style.color = this._textColor;
        this.borderColor = this._focusedBorderColor;
        this.borderSize = 2;
        this.emitter.emit('focus');
    }
    public focus() {
        if (this._isResize) {
            this.resize();
        }
        if (this._isDrawStyle) {
            this.drawStyle();
        }
        if (this._isUpdateElementSize) {
            this.updateElementSize();
        }
        this.updateTransform();
        this.element.style.display = 'block';
        Ticker.shared.addOnce(() => {
            this.element.focus();
        });
    }

    private onInput() {
        this._value = this.element.value;
    }

    private onBlur() {
        if (!this._isFocused && this.element.style.display === 'none') {
            return;
        }
        this._isFocused = false;
        this.value = this.element.value;
        this.borderColor = this._blurredBorderColor;
        this.borderSize = 1;
        this.element.style.color = 'transparent';
        this.element.style.display = 'none';
        this.valueLabel.display.visible = true;
        this.emitter.emit('blur');
    }
    public blur() {
        this.element.blur();
        if (this._isFocused || this.element.style.display !== 'none') {
            this.onBlur();
        }
    }

    public onDestroy() {
        if (this._destroyed) {
            return;
        }
        this._destroyed = true;
        this.graphics?.display.off('pointerdown', this.focus, this);
        window.removeEventListener('resize', this.handleViewportChange);
        window.removeEventListener('scroll', this.handleViewportChange, true);
        if (this.element) {
            this.element.onfocus = null;
            this.element.onblur = null;
            this.element.oninput = null;
            this.element.remove();
        }
    }
}
