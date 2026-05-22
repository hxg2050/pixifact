import { Container } from 'pixi.js';
import { prop, scene, slot } from 'pixifact/compiler';
import { mountPanelScene } from '../generated/Panel.scene.generated';
import type { PanelParts } from '../generated/Panel.scene.generated';

@scene('./scenes/Panel.scene')
export class Panel extends Container {
    readonly #parts: PanelParts;

    constructor() {
        super();
        this.#parts = mountPanelScene(this);
    }

    @prop({ type: 'string', default: 'Panel' })
    set title(value: string) {
        this.#parts.titleText.text = value;
    }

    @slot()
    declare readonly content: Container;

    @slot({ name: 'footer' })
    declare readonly footer: Container;
}
