import { Container, Graphics, Text } from 'pixi.js';
import { registerScene, registerSlot } from 'pixifact/compiler';

export type ButtonParts = {
  root: Container;
  parts: {
    background: Graphics;
    iconHost: Container;
    labelText: Text;
  };
  slots: Record<string, Container>;
};

export function mountButtonScene(root: Container) {
  const __pixifactSlots: Record<string, Container> = {};
  root.width = 188;
  root.height = 48;
  const background = new Graphics();
  background.label = "background";
  background.roundRect(0, 0, 188, 48, 10).fill(3108845);
  root.addChild(background);
  const iconHost = new Container();
  iconHost.label = "iconHost";
  iconHost.position.set(18, 14);
  root.addChild(iconHost);
  __pixifactSlots["icon"] = iconHost;
  registerSlot(root, "icon", iconHost);
  const labelText = new Text({ text: "Button", style: { fontSize: 17, fontWeight: "700", fill: 16777215 } });
  labelText.label = "labelText";
  labelText.position.set(54, 13);
  root.addChild(labelText);
  return {
    root,
    parts: { background, iconHost, labelText },
    slots: __pixifactSlots,
  };
}

registerScene("scenes/Button.scene", {
  mount: mountButtonScene,
});
