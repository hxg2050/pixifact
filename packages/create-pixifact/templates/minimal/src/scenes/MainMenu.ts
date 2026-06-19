import { Graphics, Text } from 'pixi.js';
import { Group } from 'pixifact/runtime';
import { createEvent, event, part, scene } from 'pixifact/compiler';

@scene()
export class MainMenu extends Group {
    @part()
    protected declare startButtonBack: Graphics;

    @part()
    protected declare startLabel: Text;

    @event()
    readonly start = createEvent();

    onMounted() {
        this.startButtonBack.eventMode = 'static';
        this.startButtonBack.cursor = 'pointer';
        this.startButtonBack.on('pointertap', () => {
            this.startLabel.text = 'READY';
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
