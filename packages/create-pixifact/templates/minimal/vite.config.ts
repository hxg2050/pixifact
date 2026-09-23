import { defineConfig } from 'vite';
import { pixifact, pixifactRuntimePlugin } from 'pixifact/compiler-node';

export default defineConfig({
    plugins: [
        pixifact(),
        pixifactRuntimePlugin(),
    ],
});
