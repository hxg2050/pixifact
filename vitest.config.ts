import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

const pixifactSrc = new URL('./packages/pixifact/src', import.meta.url).pathname;

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: [
            {
                find: '@pixifact/platform-wechat',
                replacement: new URL('./packages/platform-wechat/src/index.ts', import.meta.url).pathname,
            },
            {
                find: '@pixifact/platform-douyin',
                replacement: new URL('./packages/platform-douyin/src/index.ts', import.meta.url).pathname,
            },
            {
                find: 'pixifact/internal/minigame',
                replacement: `${pixifactSrc}/platform/minigame/index.ts`,
            },
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
        fileParallelism: false,
        include: ['tests/**/*.test.ts'],
    },
});
