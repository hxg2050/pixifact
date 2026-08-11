import { defineConfig } from 'vite';
import { pixifact, pixifactRuntimePlugin } from 'pixifact/compiler-node';

const projectRoot = new URL('.', import.meta.url);

export default defineConfig({
    plugins: [
        pixifact({ projectRoot }),
        pixifactRuntimePlugin({ projectRoot }),
    ],
    server: {
        host: '127.0.0.1',
        port: 5178,
        strictPort: true,
    },
});
