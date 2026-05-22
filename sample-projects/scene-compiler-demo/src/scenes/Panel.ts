import { Container } from 'pixi.js';
import { prop, scene, slot } from 'pixifact/compiler';
import { mountPanelScene } from '../generated/Panel.scene.generated';
import type { PanelParts } from '../generated/Panel.scene.generated';

export interface PanelSlots {
    default: Container;
    footer: Container;
}

@scene('./scenes/Panel.scene')
export class Panel extends Container {
    readonly slots: PanelSlots;
    readonly #parts: PanelParts;

    constructor() {
        super();
        this.#parts = mountPanelScene(this);
        this.slots = {
            default: this.#parts.contentHost,
            footer: this.#parts.footerHost,
        };
    }

    @prop({ type: 'string', default: 'Panel' })
    set title(value: string) {
        this.#parts.titleText.text = value;
    }

    @slot()
    get content() {
        return this.slots.default;
    }

    @slot({ name: 'footer' })
    get footer() {
        return this.slots.footer;
    }
}
