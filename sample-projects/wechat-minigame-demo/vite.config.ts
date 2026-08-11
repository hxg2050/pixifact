import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { pixifact } from '../../packages/pixifact/src/compiler-node/index';

const projectRoot = new URL('.', import.meta.url);
const pixifactSrc = fileURLToPath(new URL('../../packages/pixifact/src', import.meta.url));
const wechatPlatform = fileURLToPath(new URL('../../packages/platform-wechat/src/index.ts', import.meta.url));
const douyinPlatform = fileURLToPath(new URL('../../packages/platform-douyin/src/index.ts', import.meta.url));

export default defineConfig({
    resolve: {
        alias: [
            { find: '@pixifact/platform-wechat', replacement: wechatPlatform },
            { find: '@pixifact/platform-douyin', replacement: douyinPlatform },
            { find: 'pixifact/internal/minigame', replacement: `${pixifactSrc}/platform/minigame/index.ts` },
            { find: /^pixifact\/(.+)$/, replacement: `${pixifactSrc}/$1` },
            { find: 'pixifact', replacement: `${pixifactSrc}/index.ts` },
        ],
    },
    plugins: [pixifact({ projectRoot })],
    server: {
        host: '127.0.0.1',
        port: 5179,
        strictPort: true,
    },
});
