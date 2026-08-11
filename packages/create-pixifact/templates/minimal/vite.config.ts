import { defineConfig } from 'vite';
import { pixifact } from 'pixifact/compiler-node';

export default defineConfig({
    plugins: [
        pixifact(),
    ],
});
