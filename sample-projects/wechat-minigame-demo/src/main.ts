import 'pixifact:scenes';
import { Assets } from 'pixi.js';
import { createApplication } from 'pixifact:platform';
import manifest from 'pixifact:assets';
import { startGame } from './startGame';

async function main() {
    if (import.meta.env.VITE_PLATFORM === 'web') {
        await import('./styles.css');
    }
    const webRoot = import.meta.env.VITE_PLATFORM === 'web'
        ? document.querySelector<HTMLElement>('#game')
        : null;
    const app = await createApplication({
        antialias: true,
        autoDensity: import.meta.env.VITE_PLATFORM === 'web',
        backgroundColor: 0x09111a,
        ...(webRoot ? {
            height: webRoot.clientHeight,
            resolution: Math.min(window.devicePixelRatio || 1, 2),
            width: webRoot.clientWidth,
        } : {}),
    });
    if (webRoot) webRoot.append(app.canvas);

    await Assets.init({ manifest });
    await Assets.loadBundle('demo-level');
    await startGame({ height: app.screen.height, stage: app.stage, width: app.screen.width });
    const level = await Assets.load('resources/demo-level/level.json');
    console.info(`[pixifact-${import.meta.env.VITE_PLATFORM}]`, level);
}

void main().catch((error: unknown) => {
    console.error(`[pixifact-${import.meta.env.VITE_PLATFORM}] Failed to start`, error);
});
