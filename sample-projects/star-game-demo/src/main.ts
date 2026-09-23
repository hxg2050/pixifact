import './styles.css';
import 'pixifact:scenes';
import { Assets } from 'pixi.js';
import type { PixifactProjectConfig } from 'pixifact';
import { createApplication } from 'pixifact:platform';
import manifest from 'pixifact:assets';
import { prepareSceneClass } from 'pixifact/scene';
import { applyPixifactViewportLayout, calculatePixifactViewportLayout } from 'pixifact/runtime';
import projectConfigJson from '../pixifact.project.json';
import type { StarGameLevel } from './gameLogic';
import { Main } from './scenes/Main';

async function main() {
    const root = document.querySelector<HTMLElement>('#game')!;
    const screen = root.getBoundingClientRect();
    const app = await createApplication({
        width: screen.width,
        height: screen.height,
        backgroundColor: 0x050b16,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
    });
    root.append(app.canvas);

    await Assets.init({ manifest });
    await Assets.loadBundle('demo-level');
    const level = await Assets.load('resources/demo-level/level.json') as StarGameLevel;
    await prepareSceneClass(Main);
    const scene = new Main();
    scene.setLevel(level);
    app.stage.addChild(scene);

    const project = projectConfigJson as PixifactProjectConfig;
    function resize() {
        const nextScreen = root.getBoundingClientRect();
        app.renderer.resize(nextScreen.width, nextScreen.height);
        applyPixifactViewportLayout({ root: scene, stage: app.stage }, calculatePixifactViewportLayout({
            resolution: project.resolution,
            screen: { width: nextScreen.width, height: nextScreen.height },
            mode: project.viewport.mode,
        }));
    }
    resize();
    new ResizeObserver(resize).observe(root);

    if (import.meta.env.DEV) {
        const { registerPixiRuntime } = await import('pixifact/runtime-dev');
        registerPixiRuntime(app, { getState: () => ({ ...scene.snapshot() }) });
    }
}

void main().catch((error: unknown) => {
    console.error('追星九宫格启动失败', error);
});
