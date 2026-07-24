import 'pixifact:scenes';
import { createWechatPixiApplication, fetchWechatResource, loadWechatSubpackage } from 'pixifact/platform/wechat';
import { startGame } from '../startGame';

async function main() {
    const app = await createWechatPixiApplication({ backgroundColor: 0x09111a });
    await startGame({ height: app.screen.height, stage: app.stage, width: app.screen.width });
    await loadWechatSubpackage('demo-level');
    const level = await fetchWechatResource('subpackages/demo-level/level.json')
        .then((response) => response.json());
    console.info('[pixifact-wechat]', level);
}

void main().catch((error: unknown) => {
    console.error('[pixifact-wechat] Failed to start', error);
});
