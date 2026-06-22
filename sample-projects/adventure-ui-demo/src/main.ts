import './styles.css';
import 'pixifact:scenes';
import { Application } from 'pixi.js';
import { Main } from './scenes/Main';

const root = document.querySelector<HTMLElement>('#game');
if (!root) {
    throw new Error('Missing #game root.');
}

const app = new Application();
await app.init({
    width: 750,
    height: 1334,
    backgroundColor: 0x070b12,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
});

root.append(app.canvas);
app.stage.addChild(new Main());
