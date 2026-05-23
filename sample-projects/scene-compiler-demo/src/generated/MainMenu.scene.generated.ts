import { Container, Graphics, Text } from 'pixi.js';
import { Button } from "../scenes/Button";
import { Panel } from "../scenes/Panel";
import { connectSceneEvent, mount, registerScene } from 'pixifact/compiler';

export type MainMenuParts = {
  root: Container;
  parts: {
    settingsPanel: Panel;
    bodyText: Text;
    startButton: Button;
    playIcon: Graphics;
  };
  slots: Record<string, Container>;
};

export function mountMainMenuScene(root: Container, actions: Record<string, () => void> = {}) {
  const __pixifactSlots: Record<string, Container> = {};
  root.width = 960;
  root.height = 540;
  const settingsPanel = new Panel();
  settingsPanel.position.set(220, 118);
  settingsPanel.title = "Scene Compiler Demo";
  root.addChild(settingsPanel);
  const bodyText = new Text({ text: "Button and Panel are independent Scene scripts. Panel exposes slots; Button exposes props and click.", style: { fontSize: 18, fill: 13162482 } });
  bodyText.label = "bodyText";
  bodyText.position.set(0, 0);
  mount(settingsPanel, bodyText, "default");
  const startButton = new Button();
  startButton.label = "Start";
  connectSceneEvent(startButton.click, "startGame", root, actions);
  const playIcon = new Graphics();
  playIcon.label = "playIcon";
  playIcon.roundRect(0, 0, 18, 18, 4).fill(16777215);
  mount(startButton, playIcon, "icon");
  mount(settingsPanel, startButton, "footer");
  return {
    root,
    parts: { settingsPanel, bodyText, startButton, playIcon },
    slots: __pixifactSlots,
  };
}

registerScene("./scenes/MainMenu.scene", {
  mount: mountMainMenuScene,
});
