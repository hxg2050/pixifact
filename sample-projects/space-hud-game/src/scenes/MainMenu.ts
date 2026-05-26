import { Container, Graphics } from 'pixi.js';
import { createEvent, event, part, scene } from 'pixifact/compiler';

@scene()
export class MainMenu extends Container {
    @part()
    protected declare startButtonBack: Graphics;

    @event()
    readonly start = createEvent();

    onMounted() {
        this.startButtonBack.eventMode = 'static';
        this.startButtonBack.cursor = 'pointer';
        this.startButtonBack.on('pointertap', () => {
            this.start.emit();
        });
        this.startButtonBack.on('pointerover', () => {
            this.startButtonBack.tint = 0xc7d2fe;
        });
        this.startButtonBack.on('pointerout', () => {
            this.startButtonBack.tint = 0xffffff;
        });
    }
}
