import { Container, Graphics, Text } from 'pixi.js';
import { createEvent, event, part, prop, scene } from 'pixifact/compiler';

@scene()
export class GameOver extends Container {
    @part()
    protected declare restartButtonBack: Graphics;

    @part()
    protected declare scoreText: Text;

    @event()
    readonly restart = createEvent();

    onMounted() {
        this.restartButtonBack.eventMode = 'static';
        this.restartButtonBack.cursor = 'pointer';
        this.restartButtonBack.on('pointertap', () => {
            this.restart.emit();
        });
        this.restartButtonBack.on('pointerover', () => {
            this.restartButtonBack.tint = 0xfed7aa;
        });
        this.restartButtonBack.on('pointerout', () => {
            this.restartButtonBack.tint = 0xffffff;
        });
    }

    @prop({ type: 'number', default: 0 })
    set finalScore(value: number) {
        this.scoreText.text = Math.floor(value).toString().padStart(6, '0');
    }
}
