import { GameObject } from "../GameObject";
import { FillInput, Graphics as PIXIGraphics, StrokeInput } from 'pixi.js'

export class Graphics extends GameObject<PIXIGraphics> {
    public display = new PIXIGraphics();

    public rect(x: number, y: number, width: number, height: number) {
        this.display.rect(x, y, width, height);
        return this;
    }

    public roundRect(x: number, y: number, width: number, height: number, radius: number) {
        this.display.roundRect(x, y, width, height, radius);
        return this;
    }

    public circle(x: number, y: number, radius: number) {
        this.display.circle(x, y, radius);
        return this;
    }

    public stroke(style?: StrokeInput) {
        this.display.stroke(style)
        return this;
    }

    public fill(style?: FillInput) {
        this.display.fill(style)
        return this;
    }

    public clear() {
        this.display.clear();
        return this;
    }
}