import { Text } from "pixi.js";
import type { TextStyleFontWeight } from "pixi.js";
import { ComponentMeta, Prop } from "../../core";
import { Graphic } from "./Graphic";

@ComponentMeta({
    type: 'ui.TextGraphic',
    displayName: 'Text',
    category: 'UI/Graphic',
    description: 'Draws a text label on the host group.',
})
export class TextGraphic extends Graphic<Text> {
    @Prop({ type: 'string', default: '' })
    public text = '';

    @Prop({ type: 'color', default: 0x000000 })
    public color = 0x000000;

    @Prop({ type: 'number', default: 14, min: 1 })
    public fontSize = 14;

    @Prop({ type: 'string', default: 'Arial' })
    public fontFamily: string | string[] = 'Arial';

    @Prop({
        type: 'enum',
        default: 'normal',
        options: ['normal', 'bold', 'bolder', 'lighter', '100', '200', '300', '400', '500', '600', '700', '800', '900'],
    })
    public fontWeight: TextStyleFontWeight = 'normal';

    @Prop({ type: 'boolean', default: false })
    public center = false;

    protected createDisplay() {
        this.display = new Text();
    }

    protected redraw() {
        this.display.text = this.text;
        this.display.style = {
            fill: this.color,
            fontFamily: this.fontFamily,
            fontSize: this.fontSize,
            fontWeight: this.fontWeight,
        };

        if (this.center) {
            this.display.anchor.set(0.5);
            this.display.x = this.gameObject.width / 2;
            this.display.y = this.gameObject.height / 2;
        } else {
            this.display.anchor.set(0);
            this.display.x = 0;
            this.display.y = 0;
        }
    }
}
