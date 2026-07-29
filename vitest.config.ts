import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

const pixifactSrc = new URL('./packages/pixifact/src', import.meta.url).pathname;

export default defineConfig({
    plugins: [vue()],
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
