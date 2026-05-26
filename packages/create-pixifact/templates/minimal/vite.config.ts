import { defineConfig } from 'vite';
import { pixifactScenesPlugin } from 'pixifact/compiler-node';

const projectRoot = new URL('.', import.meta.url);

export default defineConfig({
    plugins: [
        pixifactScenesPlugin({ projectRoot }),
    ],
});
