import { Container, Graphics, Text } from 'pixi.js';
import { registerSlot } from 'pixifact/compiler';

export type ButtonParts = {
    root: Container;
    background: Graphics;
    iconHost: Container;
    labelText: Text;
};

export function mountButtonScene(root: Container): ButtonParts {
    root.width = 188;
    root.height = 48;

    const background = new Graphics();
    background.roundRect(0, 0, 188, 48, 10).fill(0x2f6fed);
    root.addChild(background);

    const iconHost = new Container();
    iconHost.position.set(18, 14);
    root.addChild(iconHost);
    registerSlot(root, 'icon', iconHost);

    const labelText = new Text({
        text: 'Button',
        style: {
            fontSize: 17,
            fontWeight: '700',
            fill: 0xffffff,
        },
    });
    labelText.position.set(54, 13);
    root.addChild(labelText);

    return { root, background, iconHost, labelText };
}
