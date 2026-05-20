import { defineConfig } from 'vite';

const pixifactSrc = new URL('../../packages/pixifact/src', import.meta.url).pathname;

export default defineConfig({
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
