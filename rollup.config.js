import typescript from '@rollup/plugin-typescript';
import { defineConfig } from 'rollup';

export default defineConfig({
    input: 'src/index.ts',
    external: [
      'pixi.js',
      '@math.gl/core',
      'eventemitter3',
    ],
    output: [{
      file: 'dist/index.cjs',
      format: 'cjs',
      exports: 'named',
    }, {
      file: 'dist/index.mjs',
      format: 'esm',
    }],
    plugins: [typescript()],
  })
