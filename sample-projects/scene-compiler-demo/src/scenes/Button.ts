import { Container, Graphics, Text } from 'pixi.js';
import { createEvent, event, part, prop, scene, slot } from 'pixifact/compiler';

@scene()
export class Button extends Container {
    @part()
    protected declare background: Graphics;

    @part()
    protected declare labelText: Text;

    @event()
    readonly click = createEvent();

    onMounted() {
        this.eventMode = 'static';
        this.cursor = 'pointer';
        this.on('pointertap', () => {
            this.click.emit();
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

    @slot()
    declare readonly icon: Container;

    setIconGraphic(graphic: Graphics) {
        graphic.rotation = Math.PI / 4;
    }
}
