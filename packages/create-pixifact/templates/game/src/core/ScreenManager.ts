import type { DestroyOptions } from 'pixi.js';
import { Group } from 'pixifact/runtime';

export class ScreenManager extends Group {
    private disconnects: (() => void)[] = [];

    replace(screen: Group) {
        this.clear();
        this.addChild(screen);
    }

    track(disconnect: () => void) {
        this.disconnects.push(disconnect);
    }

    clear() {
        for (const disconnect of this.disconnects.splice(0)) disconnect();
        for (const screen of this.removeChildren()) screen.destroy({ children: true });
    }

    override destroy(options?: DestroyOptions) {
        this.clear();
        super.destroy(options);
    }
}
