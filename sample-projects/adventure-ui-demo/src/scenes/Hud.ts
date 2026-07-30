import { Group } from 'pixifact/runtime';
import { prop, scene } from 'pixifact/scene';

@scene()
export class Hud extends Group {
    @prop({ default: '艾拉' })
    declare playerName: string;

    @prop({ default: 1280 })
    declare gold: number;
}
