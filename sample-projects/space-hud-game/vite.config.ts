import { defineConfig } from 'vite';
import { pixifactScenesPlugin } from '../../packages/pixifact/src/compiler-node/vite';

const pixifactSrc = new URL('../../packages/pixifact/src', import.meta.url).pathname;
const projectRoot = new URL('.', import.meta.url);

export default defineConfig({
    plugins: [
        pixifactScenesPlugin({ projectRoot }),
    ],
    resolve: {
        alias: [
            {
                find: /^pixifact\/(.+)$/,
                replacement: `${pixifactSrc}/$1`,
            },
            {
                find: 'pixifact',
                replacement: `${pixifactSrc}/index.ts`,
            },
        ],
    },
});
