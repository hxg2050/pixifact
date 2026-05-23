import { Container, Graphics, Text } from 'pixi.js';
import { event, part, prop, scene, slot } from 'pixifact/compiler';

@scene('./scenes/Button.scene')
export class Button extends Container {
    @part()
    protected declare background: Graphics;

    @part()
    protected declare labelText: Text;

    #clickHandler?: () => void;

    onMounted() {
        this.eventMode = 'static';
        this.cursor = 'pointer';
        this.on('pointertap', () => {
            this.#clickHandler?.();
        });
        this.on('pointerover', () => {
            this.background.tint = 0xc8dcff;
        });
        this.on('pointerout', () => {
            this.background.tint = 0xffffff;
        });
    }

    @prop({ type: 'string', default: 'Button' })
    set label(value: string) {
        this.labelText.text = value;
    }

    @prop({ type: 'boolean', default: false })
    set disabled(value: boolean) {
        this.alpha = value ? 0.48 : 1;
        this.eventMode = value ? 'none' : 'static';
    }

    @event()
    onClick(handler: () => void) {
        this.#clickHandler = handler;
    }

    @slot()
    declare readonly icon: Container;

    setIconGraphic(graphic: Graphics) {
        graphic.rotation = Math.PI / 4;
    }
}
