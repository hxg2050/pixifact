import './styles.css';
import './generated/scenes.generated';
import { Application, Container, Graphics, Text } from 'pixi.js';
import { mount } from 'pixifact/compiler';
import { Button } from './scenes/Button';
import { Panel } from './scenes/Panel';

const root = document.querySelector<HTMLElement>('#game');
if (!root) {
    throw new Error('Missing #game root.');
}

const app = new Application();
await app.init({
    width: 960,
    height: 540,
    backgroundColor: 0x10131d,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
});
root.append(app.canvas);

const sceneRoot = new Container();
app.stage.addChild(sceneRoot);

const panel = new Panel();
panel.position.set(220, 118);
panel.title = 'Scene Compiler Demo';
sceneRoot.addChild(panel);

const bodyText = new Text({
    text: 'Button and Panel are independent Scene scripts.\nPanel exposes slots; Button exposes props and click.',
    style: {
        fontSize: 18,
        fill: 0xc8d7f2,
        lineHeight: 30,
        wordWrap: true,
        wordWrapWidth: 440,
    },
});
mount(panel, bodyText);

const button = new Button();
button.label = 'Start';
button.click.connect(() => {
    button.label = button.label === undefined ? 'Started' : 'Started';
    bodyText.text = 'Click handled through Button public event.\nThe parent scene never touches Button internals.';
});
mount(panel, button, 'footer');

const playIcon = new Graphics();
playIcon.roundRect(0, 0, 18, 18, 4).fill(0xffffff);
button.setIconGraphic(playIcon);
mount(button, playIcon, 'icon');
