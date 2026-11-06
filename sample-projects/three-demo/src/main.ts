import 'pixifact:scenes';
import { Assets } from 'pixi.js';
import { createApplication } from 'pixifact:platform';
import manifest from 'pixifact:assets';
import { prepareSceneClass } from 'pixifact/scene';
import { Hud } from './scenes/Hud';

async function main() {
    const web = import.meta.env.VITE_PLATFORM === 'web';
    const app = await createApplication({
        preference: 'webgl', antialias: true, autoStart: false,
        ...(web ? { resizeTo: window, resolution: Math.min(devicePixelRatio, 2), autoDensity: true } : {}),
    });
    if (web) document.body.appendChild(app.canvas);
    await Assets.init({ manifest });
    await prepareSceneClass(Hud);
    const hud = new Hud();
    app.stage.addChild(hud);
    const { startGame } = await import('./game');
    const game = await startGame(app, hud);
    if (web && import.meta.env.DEV) {
        const { registerPixiRuntime } = await import('pixifact/runtime-dev');
        registerPixiRuntime(app, { captureScreenshot: game.layer.captureScreenshot, getState: game.getState });
    }
    app.start();
    import.meta.hot?.dispose(() => { game.destroy(); app.destroy(true, { children: true }); });
}

void main();
