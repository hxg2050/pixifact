import type { DestroyOptions } from 'pixi.js';
import { Group, setFrameLayout } from 'pixifact/runtime';

export class ScreenManager extends Group {
    private disconnects: (() => void)[] = [];

    replace(screen: Group) {
        this.clear();
        setFrameLayout(screen, { left: 0, right: 0, top: 0, bottom: 0 });
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
