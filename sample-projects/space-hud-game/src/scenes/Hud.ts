import { Container, Graphics, Text } from 'pixi.js';
import { part, prop, scene } from 'pixifact/compiler';

@scene()
export class Hud extends Container {
    @part()
    protected declare hpFill: Graphics;

    @part()
    protected declare energyFill: Graphics;

    @part()
    protected declare scoreText: Text;

    @part()
    protected declare waveText: Text;

    @part()
    protected declare timeText: Text;

    @prop({ type: Number, default: 100 })
    set hp(value: number) {
        this.hpFill.width = 548 * Math.max(0, Math.min(1, value / 100));
    }

    @prop({ type: Number, default: 0 })
    set score(value: number) {
        this.scoreText.text = Math.floor(value).toString().padStart(6, '0');
    }

    @prop({ type: Number, default: 1 })
    set wave(value: number) {
        this.waveText.text = Math.max(1, Math.floor(value)).toString().padStart(2, '0');
    }

    @prop({ type: Number, default: 0 })
    set time(value: number) {
        const total = Math.max(0, Math.floor(value));
        const minutes = Math.floor(total / 60).toString().padStart(2, '0');
        const seconds = (total % 60).toString().padStart(2, '0');
        this.timeText.text = `${minutes}:${seconds}`;
    }

    @prop({ type: Number, default: 100 })
    set energy(value: number) {
        this.energyFill.width = 500 * Math.max(0, Math.min(1, value / 100));
    }
}
