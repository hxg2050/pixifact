import { Sprite, Texture } from "pixi.js";
import { ComponentMeta, GameObject, Prop } from "../../runtime";
import { Graphic } from "./Graphic";

@ComponentMeta({
    type: 'ui.ImageGraphic',
    displayName: 'Image',
    category: 'UI/Graphic',
    description: 'Draws an image sprite using the host group logical size.',
})
export class ImageGraphic extends Graphic<Sprite> {
    @Prop({ type: 'assetRef', default: '', assetType: 'image' })
    public src = '';

    @Prop({ type: 'color', default: 0xffffff })
    public tint = 0xffffff;

    protected createDisplay() {
        this.display = new Sprite(Texture.EMPTY);
        this.gameObject.emitter.on(GameObject.Event.RESIZE, this.setDirty, this);
    }

    protected redraw() {
        this.display.texture = this.src ? Texture.from(this.src) : Texture.EMPTY;
        this.display.width = this.gameObject.width;
        this.display.height = this.gameObject.height;
        this.display.tint = this.tint;
    }

    onDestroy() {
        this.gameObject.emitter.off(GameObject.Event.RESIZE, this.setDirty, this);
        super.onDestroy();
    }
}
