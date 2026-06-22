import type { Text } from 'pixi.js';
import { Group, type NineImage } from 'pixifact/runtime';
import { part, prop, scene } from 'pixifact/compiler';

@scene()
export class ItemSlot extends Group {
    #itemName = '药水';
    #quantity = 1;
    #selected = false;

    @part()
    protected declare frame: NineImage;

    @part()
    protected declare nameText: Text;

    @part()
    protected declare quantityText: Text;

    @prop({ type: String, default: '药水' })
    set itemName(value: string) {
        this.#itemName = value;
        if (this.nameText) {
            this.nameText.text = value;
        }
    }

    get itemName() {
        return this.#itemName;
    }

    @prop({ type: Number, default: 1 })
    set quantity(value: number) {
        this.#quantity = value;
        if (this.quantityText) {
            this.quantityText.text = `x${value}`;
        }
    }

    get quantity() {
        return this.#quantity;
    }

    @prop({ type: Boolean, default: false })
    set selected(value: boolean) {
        this.#selected = value;
        this.#applySelected();
    }

    get selected() {
        return this.#selected;
    }

    onMounted() {
        this.nameText.text = this.#itemName;
        this.quantityText.text = `x${this.#quantity}`;
        this.#applySelected();
    }

    #applySelected() {
        if (!this.frame) {
            return;
        }
        this.frame.tint = this.#selected ? 0xffd978 : 0xffffff;
    }
}
