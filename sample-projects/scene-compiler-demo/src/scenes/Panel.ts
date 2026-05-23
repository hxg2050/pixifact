import { Container, Text } from 'pixi.js';
import { part, prop, scene, slot } from 'pixifact/compiler';

@scene('scenes/Panel.scene')
export class Panel extends Container {
    @part()
    protected declare titleText: Text;

    @prop({ type: 'string', default: 'Panel' })
    set title(value: string) {
        this.titleText.text = value;
    }

    @slot()
    declare readonly content: Container;

    @slot({ name: 'footer' })
    declare readonly footer: Container;
}
