import type { Container } from 'pixi.js';
import { Group } from 'pixifact/runtime';
import { createEvent, event, prop, scene, slot } from 'pixifact/scene';

@scene()
export class Button extends Group {
    @prop({ default: '按钮' })
    declare text: string;

    @prop({ default: false })
    declare disabled: boolean;

    @event()
    readonly clicked = createEvent();

    @slot()
    declare readonly icon: Container;

    activate() {
        if (!this.disabled) this.clicked.emit();
    }
}
