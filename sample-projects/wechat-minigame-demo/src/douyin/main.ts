import 'pixifact:scenes';
import { createDouyinPixiApplication, fetchDouyinResource, loadDouyinSubpackage } from 'pixifact/platform/douyin';
import { startGame } from '../startGame';

async function main() {
    const app = await createDouyinPixiApplication({ backgroundColor: 0x09111a });
    await startGame({ height: app.screen.height, stage: app.stage, width: app.screen.width });
    await loadDouyinSubpackage('demo-level');
    const level = await fetchDouyinResource('subpackages/demo-level/level.json')
        .then((response) => response.json());
    console.info('[pixifact-douyin]', level);
}

void main().catch((error: unknown) => {
    console.error('[pixifact-douyin] Failed to start', error);
});
