import './styles.css';
import 'pixifact:scenes';
import { Application } from 'pixi.js';
import { applyPixifactViewportLayout, calculatePixifactViewportLayout } from 'pixifact/runtime';
import { Main } from './scenes/Main';

const root = document.querySelector<HTMLElement>('#game');
if (!root) {
    throw new Error('Missing #game root.');
}

const resolution = { width: 750, height: 1334 };
const viewport = { mode: 'fixedWidth' as const };
const screen = root.getBoundingClientRect();
const app = new Application();
await app.init({
    width: screen.width,
    height: screen.height,
    backgroundColor: 0x070b12,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
});

const scene = new Main();

function resizeViewport() {
    const nextScreen = root.getBoundingClientRect();
    app.renderer.resize(nextScreen.width, nextScreen.height);
    applyPixifactViewportLayout({
        root: scene,
        stage: app.stage,
    }, calculatePixifactViewportLayout({
        resolution,
        screen: {
            width: nextScreen.width,
            height: nextScreen.height,
        },
        mode: viewport.mode,
    }));
}

root.append(app.canvas);
app.stage.addChild(scene);
resizeViewport();

const resizeObserver = new ResizeObserver(resizeViewport);
resizeObserver.observe(root);
