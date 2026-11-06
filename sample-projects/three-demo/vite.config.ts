import { defineConfig } from 'vite';
import { pixifact, pixifactRuntimePlugin } from 'pixifact/compiler-node';
import { three } from '@pixifact/three/vite';

export default defineConfig({
    plugins: [pixifact({ codePackages: { game: 'src/game.ts' } }), three(), pixifactRuntimePlugin()],
    server: { host: '127.0.0.1', port: 5181, strictPort: true },
});
