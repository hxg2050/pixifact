import { Container, Graphics } from 'pixi.js';
import { event, prop, scene, slot } from 'pixifact/compiler';
import { mountButtonScene } from '../generated/Button.scene.generated';
import type { ButtonParts } from '../generated/Button.scene.generated';

@scene('./scenes/Button.scene')
export class Button extends Container {
    readonly #parts: ButtonParts;
    #clickHandler?: () => void;

    constructor() {
        super();
        this.#parts = mountButtonScene(this);
        this.eventMode = 'static';
        this.cursor = 'pointer';
        this.on('pointertap', () => {
            this.#clickHandler?.();
        });
        this.on('pointerover', () => {
            this.#parts.background.tint = 0xc8dcff;
        });
        this.on('pointerout', () => {
            this.#parts.background.tint = 0xffffff;
        });
    }

    @prop({ type: 'string', default: 'Button' })
    set label(value: string) {
        this.#parts.labelText.text = value;
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

    @slot({ multiple: false })
    declare readonly icon: Container;

    setIconGraphic(graphic: Graphics) {
        graphic.rotation = Math.PI / 4;
    }
}
