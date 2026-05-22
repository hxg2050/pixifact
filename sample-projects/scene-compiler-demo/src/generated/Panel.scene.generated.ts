import { Container, Graphics, Text } from 'pixi.js';
import { registerSlot } from 'pixifact/compiler';

export type PanelParts = {
    root: Container;
    background: Graphics;
    headerRule: Graphics;
    titleText: Text;
    contentHost: Container;
    footerHost: Container;
};

export function mountPanelScene(root: Container): PanelParts {
    root.width = 520;
    root.height = 280;

    const background = new Graphics();
    background.roundRect(0, 0, 520, 280, 18).fill(0x192235);
    root.addChild(background);

    const headerRule = new Graphics();
    headerRule.position.set(28, 72);
    headerRule.rect(0, 0, 464, 1).fill(0x39506f);
    root.addChild(headerRule);

    const titleText = new Text({
        text: 'Panel',
        style: {
            fontSize: 24,
            fontWeight: '800',
            fill: 0xffffff,
        },
    });
    titleText.position.set(30, 28);
    root.addChild(titleText);

    const contentHost = new Container();
    contentHost.position.set(32, 96);
    root.addChild(contentHost);
    registerSlot(root, 'default', contentHost);

    const footerHost = new Container();
    footerHost.position.set(300, 208);
    root.addChild(footerHost);
    registerSlot(root, 'footer', footerHost);

    return { root, background, headerRule, titleText, contentHost, footerHost };
}
