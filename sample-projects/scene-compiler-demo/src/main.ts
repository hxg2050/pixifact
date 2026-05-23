import './styles.css';
import './generated/scenes.generated';
import { Application } from 'pixi.js';
import { MainMenu } from './scenes/MainMenu';

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

app.stage.addChild(new MainMenu());
