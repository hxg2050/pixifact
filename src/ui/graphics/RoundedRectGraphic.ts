import { Graphics as PixiGraphics } from "pixi.js";
import { ComponentMeta, GameObject, Prop } from "../../core";
import { Graphic } from "./Graphic";

@ComponentMeta({
    type: 'ui.RoundedRectGraphic',
    displayName: 'Rounded Rect',
    category: 'UI/Graphic',
    description: 'Draws a rounded rectangle using the host group logical size.',
})
export class RoundedRectGraphic extends Graphic<PixiGraphics> {
    @Prop({ type: 'color', default: 0xffffff })
    public color = 0xffffff;

    @Prop({ type: 'number', default: 1, min: 0, max: 1 })
    public fillAlpha = 1;

    @Prop({ type: 'number', default: 0, min: 0 })
    public radius = 0;

    @Prop({ type: 'color', default: 0x000000 })
    public strokeColor = 0x000000;

    @Prop({ type: 'number', default: 0, min: 0 })
    public strokeWidth = 0;

    @Prop({ type: 'number', default: 1, min: 0, max: 1 })
    public strokeAlpha = 1;

    protected createDisplay() {
        this.display = new PixiGraphics();
        this.gameObject.emitter.on(GameObject.Event.RESIZE, this.setDirty, this);
    }

    protected redraw() {
        this.display.clear();
        this.display
            .roundRect(0, 0, this.gameObject.width, this.gameObject.height, this.radius)
            .fill({ color: this.color, alpha: this.fillAlpha });

        if (this.strokeWidth > 0) {
            this.display.stroke({
                width: this.strokeWidth,
                color: this.strokeColor,
                alpha: this.strokeAlpha,
            });
        }
    }

    onDestroy() {
        this.gameObject.emitter.off(GameObject.Event.RESIZE, this.setDirty, this);
        super.onDestroy();
    }
}
