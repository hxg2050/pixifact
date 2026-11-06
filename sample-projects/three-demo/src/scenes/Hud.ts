import { Graphics, Text } from 'pixi.js';
import { Group } from 'pixifact/runtime';
import { part, scene } from 'pixifact/scene';

@scene()
export class Hud extends Group {
    @part() declare toggle: Graphics;
    @part() declare toggleText: Text;
}
