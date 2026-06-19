#!/usr/bin/env bun
import { spawnSync } from 'node:child_process';

const packageDirs = [
    'packages/pixifact',
    'packages/pixifact-cli',
    'packages/create-pixifact',
];

for (const dir of packageDirs) {
    console.log(`Checking package contents in ${dir}`);
    const result = spawnSync('npm', ['pack', '--dry-run', '--json', '.'], {
        cwd: dir,
        stdio: 'inherit',
    });
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}
