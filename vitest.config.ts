import { defineConfig } from 'vitest/config';

const pixifactSrc = new URL('./packages/pixifact/src', import.meta.url).pathname;

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
    test: {
        environment: 'happy-dom',
        include: ['tests/**/*.test.ts'],
    },
});
