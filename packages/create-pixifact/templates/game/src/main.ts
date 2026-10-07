import './styles.css';
import 'pixifact:scenes';
import { Assets } from 'pixi.js';
import { createApplication } from 'pixifact:platform';
import manifest from 'pixifact:assets';
import type { PixifactProjectConfig } from 'pixifact';
import { applyPixifactViewportLayout, calculatePixifactViewportLayout } from 'pixifact/runtime';
import { prepareSceneClass } from 'pixifact/scene';
import projectJson from '../pixifact.project.json';
import { GameApp } from './GameApp';
import { WebRecordStore } from './core/WebRecordStore';
import { MainMenu } from './screens/MainMenu';
import { PlayScreen } from './screens/PlayScreen';
import { ResultScreen } from './screens/ResultScreen';
import { Dialog } from './ui/Dialog';

const root = document.querySelector<HTMLElement>('#game')!;
const screen = root.getBoundingClientRect();
const app = await createApplication({
    width: screen.width,
    height: screen.height,
    backgroundColor: 0xe5e9e3,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio, 2),
});
root.append(app.canvas);

await Assets.init({ manifest });
await Promise.all([MainMenu, PlayScreen, ResultScreen, Dialog].map((scene) => prepareSceneClass(scene)));
const game = new GameApp(new WebRecordStore(window.localStorage));
app.stage.addChild(game);

const project = projectJson as PixifactProjectConfig;
function resize() {
    const bounds = root.getBoundingClientRect();
    app.renderer.resize(bounds.width, bounds.height);
    applyPixifactViewportLayout({ root: game, stage: app.stage }, calculatePixifactViewportLayout({
        resolution: project.resolution,
        screen: { width: bounds.width, height: bounds.height },
        mode: project.viewport.mode,
    }));
}
resize();
const observer = new ResizeObserver(resize);
observer.observe(root);

function onVisibilityChange() {
    if (document.hidden) game.pause();
}
document.addEventListener('visibilitychange', onVisibilityChange);

if (import.meta.env.DEV) {
    const { registerPixiRuntime } = await import('pixifact/runtime-dev');
    registerPixiRuntime(app, { getState: () => game.snapshot() });
}

if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        observer.disconnect();
        document.removeEventListener('visibilitychange', onVisibilityChange);
        app.destroy({ removeView: true }, { children: true });
    });
}
