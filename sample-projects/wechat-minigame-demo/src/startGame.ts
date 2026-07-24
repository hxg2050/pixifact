import type { Container } from 'pixi.js';
import { prepareSceneClass } from 'pixifact/scene';
import { applyPixifactViewportLayout, calculatePixifactViewportLayout } from 'pixifact/runtime';
import projectConfigJson from '../pixifact.project.json';
import { Main } from './scenes/Main';

interface GameHost {
    height: number;
    stage: Container;
    width: number;
}

export async function startGame(host: GameHost) {
    await prepareSceneClass(Main);
    const scene = new Main();
    const project = projectConfigJson;
    host.stage.addChild(scene);
    applyPixifactViewportLayout({ root: scene, stage: host.stage }, calculatePixifactViewportLayout({
        resolution: project.resolution,
        screen: { width: host.width, height: host.height },
        mode: project.viewport.mode as 'fixedWidth',
    }));
    return scene;
}
