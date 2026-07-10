import './styles.css';
import 'pixifact:scenes';
import { Application } from 'pixi.js';
import type { PixifactProjectConfig } from 'pixifact';
import { applyPixifactViewportLayout, calculatePixifactViewportLayout } from 'pixifact/runtime';
import projectConfigJson from '../pixifact.project.json';
import { MainMenu } from './scenes/MainMenu';

const root = document.querySelector<HTMLElement>('#game');
if (!root) {
    throw new Error('Missing #game root.');
}

const gameRoot = root;
const projectConfig = projectConfigJson as PixifactProjectConfig;
const screen = gameRoot.getBoundingClientRect();
const app = new Application();
await app.init({
    width: screen.width,
    height: screen.height,
    backgroundColor: 0x10131d,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
});

const scene = new MainMenu();

function resizeViewport() {
    const nextScreen = gameRoot.getBoundingClientRect();
    app.renderer.resize(nextScreen.width, nextScreen.height);
    applyPixifactViewportLayout({
        root: scene,
        stage: app.stage,
    }, calculatePixifactViewportLayout({
        resolution: projectConfig.resolution,
        screen: {
            width: nextScreen.width,
            height: nextScreen.height,
        },
        mode: projectConfig.viewport.mode,
    }));
}

gameRoot.append(app.canvas);
app.stage.addChild(scene);
resizeViewport();

const resizeObserver = new ResizeObserver(resizeViewport);
resizeObserver.observe(gameRoot);
