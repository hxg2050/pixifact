import { Texture } from "pixi.js";
import type { FederatedPointerEvent, TextStyleFontWeight } from "pixi.js";
import { GameObject, Graphics, Group, Label, LabelStyle, NineSliceImage } from "../core";

export class Button extends Group {
    public content!: Group;
    public background!: Graphics;
    public nineSliceImage!: NineSliceImage;
    public label!: Label;

    public radius = 10;
    public fill = 0x2563eb;
    public hoverFill = 0x1d4ed8;
    public pressedFill = 0x1e40af;
    public disabledFill = 0x94a3b8;
    public stroke = 0x1f2933;
    public strokeAlpha = 0.12;
    public textColor = 0xffffff;
    public fontFamily: string | string[] = 'Arial';
    public fontSize = 14;
    public fontWeight: TextStyleFontWeight = '700';
    public pressedScale = 0.96;

    private _value = '';
    private _texture?: Texture;
    private _disabled = false;
    private _hovered = false;
    private _pressed = false;

    get texture() {
        return this._texture;
    }
    set texture(value: Texture | undefined) {
        this._texture = value;
        if (this.nineSliceImage) {
            this.nineSliceImage.texture = value ?? Texture.EMPTY;
            this.nineSliceImage.visible = !!value;
        }
        this.drawBackground();
    }

    get value() {
        return this._value;
    }
    set value(val: string) {
        this._value = val;
        if (this.label) {
            this.label.value = val;
        }
    }

    get disabled() {
        return this._disabled;
    }
    set disabled(val: boolean) {
        if (this._disabled === val) {
            return;
        }
        this._disabled = val;
        this._pressed = false;
        this._hovered = false;
        this.display.eventMode = val ? 'none' : 'static';
        this.display.cursor = val ? 'default' : 'pointer';
        this.drawBackground();
        this.applyPressedScale();
    }

    set width(val: number) {
        super.width = val;
        this.syncSize();
    }
    get width() {
        return super.width;
    }

    set height(val: number) {
        super.height = val;
        this.syncSize();
    }
    get height() {
        return super.height;
    }

    public render() {
        this.content = GameObject.instantiate(Group, this);
        this.background = GameObject.instantiate(Graphics, this.content);
        this.nineSliceImage = GameObject.instantiate(NineSliceImage, this.content);
        this.nineSliceImage.visible = false;

        this.label = GameObject.instantiate(Label, this.content, {
            value: this._value,
            style: new LabelStyle({
                fill: this.textColor,
                fontFamily: this.fontFamily,
                fontSize: this.fontSize,
                fontWeight: this.fontWeight,
            }),
        });
        this.label.display.anchor.set(0.5);

        this.display.eventMode = this.disabled ? 'none' : 'static';
        this.display.cursor = this.disabled ? 'default' : 'pointer';
        this.display.on('pointerover', this.handlePointerOver, this);
        this.display.on('pointerout', this.handlePointerOut, this);
        this.display.on('pointerdown', this.handlePointerDown, this);
        this.display.on('pointerup', this.handlePointerUp, this);
        this.display.on('pointerupoutside', this.handlePointerUpOutside, this);
        this.display.on('pointercancel', this.handlePointerUpOutside, this);
        this.display.on('pointertap', this.handlePointerTap, this);
        this.display.once('destroyed', this.onDestroy, this);

        this.syncSize();
        this.texture = this._texture;
        this.value = this._value;
    }

    private syncSize() {
        if (!this.background) {
            return;
        }
        this.drawBackground();
        this.nineSliceImage.width = this.width;
        this.nineSliceImage.height = this.height;
        this.label.x = this.width / 2;
        this.label.y = this.height / 2;
        this.content.width = this.width;
        this.content.height = this.height;
        this.content.anchorX = 0.5;
        this.content.anchorY = 0.5;
        this.content.x = this.width / 2;
        this.content.y = this.height / 2;
    }

    private drawBackground() {
        if (!this.background) {
            return;
        }
        this.background.clear();
        if (this._texture) {
            return;
        }
        this.background
            .roundRect(0, 0, this.width, this.height, this.radius)
            .fill(this.currentFill)
            .stroke({ width: 1, color: this.stroke, alpha: this.strokeAlpha });
    }

    private get currentFill() {
        if (this.disabled) {
            return this.disabledFill;
        }
        if (this._pressed) {
            return this.pressedFill;
        }
        if (this._hovered) {
            return this.hoverFill;
        }
        return this.fill;
    }

    private applyPressedScale() {
        if (!this.content) {
            return;
        }
        const scale = this._pressed && !this.disabled ? this.pressedScale : 1;
        this.content.scaleX = scale;
        this.content.scaleY = scale;
    }

    private handlePointerOver() {
        if (this.disabled) {
            return;
        }
        this._hovered = true;
        this.drawBackground();
    }

    private handlePointerOut() {
        this._hovered = false;
        this._pressed = false;
        this.drawBackground();
        this.applyPressedScale();
    }

    private handlePointerDown(event: FederatedPointerEvent) {
        if (this.disabled) {
            return;
        }
        this._pressed = true;
        this.drawBackground();
        this.applyPressedScale();
        this.emitter.emit('press', event);
    }

    private handlePointerUp(event: FederatedPointerEvent) {
        if (this.disabled) {
            return;
        }
        this._pressed = false;
        this.drawBackground();
        this.applyPressedScale();
        this.emitter.emit('release', event);
    }

    private handlePointerUpOutside(event: FederatedPointerEvent) {
        if (this.disabled) {
            return;
        }
        this._pressed = false;
        this.drawBackground();
        this.applyPressedScale();
        this.emitter.emit('releaseOutside', event);
    }

    private handlePointerTap(event: FederatedPointerEvent) {
        if (this.disabled) {
            return;
        }
        this.emitter.emit('tap', event);
    }

    public onDestroy() {
        this.display.off('pointerover', this.handlePointerOver, this);
        this.display.off('pointerout', this.handlePointerOut, this);
        this.display.off('pointerdown', this.handlePointerDown, this);
        this.display.off('pointerup', this.handlePointerUp, this);
        this.display.off('pointerupoutside', this.handlePointerUpOutside, this);
        this.display.off('pointercancel', this.handlePointerUpOutside, this);
        this.display.off('pointertap', this.handlePointerTap, this);
        this.display.off('destroyed', this.onDestroy, this);
    }
}
