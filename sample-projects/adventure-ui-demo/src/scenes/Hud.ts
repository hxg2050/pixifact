import type { Text } from 'pixi.js';
import { Group } from 'pixifact/runtime';
import { part, prop, scene } from 'pixifact/compiler';

@scene()
export class Hud extends Group {
    #playerName = '艾拉';
    #gold = 1280;

    @part()
    protected declare nameText: Text;

    @part()
    protected declare goldText: Text;

    @prop({ type: String, default: '艾拉' })
    set playerName(value: string) {
        this.#playerName = value;
        if (this.nameText) {
            this.nameText.text = value;
        }
    }

    get playerName() {
        return this.#playerName;
    }

    @prop({ type: Number, default: 1280 })
    set gold(value: number) {
        this.#gold = value;
        if (this.goldText) {
            this.goldText.text = value.toLocaleString('zh-CN');
        }
    }

    get gold() {
        return this.#gold;
    }

    onMounted() {
        this.nameText.text = this.#playerName;
        this.goldText.text = this.#gold.toLocaleString('zh-CN');
    }
}
