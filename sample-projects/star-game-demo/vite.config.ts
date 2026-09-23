import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { pixifact, pixifactRuntimePlugin } from '../../packages/pixifact/src/compiler-node/index';

const projectRoot = new URL('.', import.meta.url);
const pixifactSrc = fileURLToPath(new URL('../../packages/pixifact/src', import.meta.url));

export default defineConfig({
    resolve: {
        alias: [
            { find: /^pixifact\/(.+)$/, replacement: `${pixifactSrc}/$1` },
            { find: 'pixifact', replacement: `${pixifactSrc}/index.ts` },
        ],
    },
    plugins: [pixifact({ projectRoot }), pixifactRuntimePlugin()],
    server: {
        host: '127.0.0.1',
        port: 5180,
        strictPort: true,
    },
});
