import type { Container, Text } from 'pixi.js';
import { Group, type Rect } from 'pixifact/runtime';
import { createEvent, event, part, prop, scene, slot } from 'pixifact/compiler';

@scene()
export class Button extends Group {
    #label = 'Button';
    #tone = 'primary';

    @part()
    protected declare background: Rect;

    @part()
    protected declare labelText: Text;

    @slot({ name: 'icon' })
    readonly icon!: Container;

    @prop({ type: String, default: 'Button' })
    set label(value: string) {
        this.#label = value;
        if (this.labelText) {
            this.labelText.text = value;
        }
    }

    get label() {
        return this.#label;
    }

    @prop({ type: String, default: 'primary' })
    set tone(value: string) {
        this.#tone = value;
        this.#applyTone();
    }

    get tone() {
        return this.#tone;
    }

    @event()
    readonly click = createEvent();

    onMounted() {
        this.labelText.text = this.#label;
        this.#applyTone();
        this.background.eventMode = 'static';
        this.background.cursor = 'pointer';
        this.background.on('pointertap', () => {
            this.click.emit();
        });
        this.background.on('pointerover', () => {
            this.background.alpha = 0.86;
        });
        this.background.on('pointerout', () => {
            this.background.alpha = 1;
        });
    }

    #applyTone() {
        if (!this.background || !this.labelText) {
            return;
        }
        if (this.#tone === 'ghost') {
            this.background.fillColor = 0x162238;
            this.background.strokeColor = 0x6f8aa4;
            this.labelText.style.fill = 0xd8e6f3;
            return;
        }
        if (this.#tone === 'danger') {
            this.background.fillColor = 0x713044;
            this.background.strokeColor = 0xff9eb2;
            this.labelText.style.fill = 0xfff0f4;
            return;
        }
        this.background.fillColor = 0x24456f;
        this.background.strokeColor = 0xf2ce76;
        this.labelText.style.fill = 0xfff3cf;
    }
}
