import '../styles.css';
import 'pixifact:scenes';
import { Application } from 'pixi.js';
import { startGame } from '../startGame';

const root = document.querySelector<HTMLElement>('#game');
if (!root) {
    throw new Error('Missing #game root.');
}
const app = new Application();
await app.init({
    antialias: true,
    autoDensity: true,
    backgroundColor: 0x09111a,
    height: root.clientHeight,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    width: root.clientWidth,
});
root.append(app.canvas);
await startGame({ height: app.screen.height, stage: app.stage, width: app.screen.width });
const level = await fetch('/demo-level/level.json').then((response) => response.json());
console.info('[pixifact-web]', level);
