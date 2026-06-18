import typescript from '@rollup/plugin-typescript';
import { defineConfig } from 'rollup';
import fs from 'node:fs';
import path from 'node:path';

function resolveTsSource() {
  return {
    name: 'resolve-ts-source',
    resolveId(source, importer) {
      if (!importer || !source.startsWith('.')) {
        return null;
      }
      const base = path.resolve(path.dirname(importer), source);
      const candidates = [
        `${base}.ts`,
        path.join(base, 'index.ts'),
      ];
      return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
    },
  };
}

export default defineConfig({
    input: 'src/index.ts',
    external: [
      'pixi.js',
    ],
    output: [{
      file: 'dist/index.cjs',
      format: 'cjs',
      exports: 'named',
    }, {
      file: 'dist/index.mjs',
      format: 'esm',
    }],
    plugins: [resolveTsSource(), typescript({
      tsconfig: '../../tsconfig.json',
      declarationDir: 'dist',
      rootDir: 'src',
    })],
  })
