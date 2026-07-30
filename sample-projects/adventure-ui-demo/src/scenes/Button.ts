import type { Container } from 'pixi.js';
import { Group, type Rect } from 'pixifact/runtime';
import { createEvent, defineVariants, event, part, prop, scene, slot } from 'pixifact/scene';

const buttonTones = defineVariants({
    primary: {
        background: '#24456f',
        border: '#f2ce76',
        text: '#fff3cf',
    },
    ghost: {
        background: '#162238',
        border: '#6f8aa4',
        text: '#d8e6f3',
    },
    danger: {
        background: '#713044',
        border: '#ff9eb2',
        text: '#fff0f4',
    },
});

@scene()
export class Button extends Group {
    @part()
    protected declare background: Rect;

    @slot({ name: 'icon' })
    readonly icon!: Container;

    @prop({ default: 'Button' })
    declare label: string;

    @prop({ default: 'primary', variants: buttonTones })
    declare tone: keyof typeof buttonTones;

    @event()
    readonly click = createEvent();

    onMounted() {
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
}
