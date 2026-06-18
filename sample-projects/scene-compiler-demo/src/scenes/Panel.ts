import { Container, Text } from 'pixi.js';
import { Group } from 'pixifact/runtime';
import { part, prop, scene, slot } from 'pixifact/compiler';

@scene()
export class Panel extends Group {
    @part()
    protected declare titleText: Text;

    @prop({ type: String, default: 'Panel' })
    set title(value: string) {
        this.titleText.text = value;
    }

    @slot()
    declare readonly content: Container;

    @slot({ name: 'footer' })
    declare readonly footer: Container;
}
