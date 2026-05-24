import { Container, Graphics, Sprite, Text, Assets } from 'pixi.js';
import __pixifactTextureUrl1 from "../../assets/btn.png?url";
import { Button } from "../scenes/Button";
import { registerScene, registerSceneClass, registerSlot } from 'pixifact/compiler';

const __pixifactTexture1 = await Assets.load(__pixifactTextureUrl1);

export type ButtonParts = {
  root: Container;
  parts: {
    background: Graphics;
    iconHost: Container;
    labelText: Text;
    sprite1: Sprite;
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
  const sprite1 = new Sprite({ texture: __pixifactTexture1 });
  sprite1.label = "sprite1";
  root.addChild(sprite1);
  return {
    root,
    parts: { background, iconHost, labelText, sprite1 },
    slots: __pixifactSlots,
  };
}

registerScene("scenes/Button.scene", {
  mount: mountButtonScene,
});
registerSceneClass(Button, "scenes/Button.scene");
