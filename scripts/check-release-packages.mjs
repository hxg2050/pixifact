#!/usr/bin/env bun
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const packageDirs = [
    'packages/pixifact',
    'packages/platform-wechat',
    'packages/platform-douyin',
    'packages/pixifact-cli',
    'packages/create-pixifact',
];

function packagePaths(value) {
    if (typeof value === 'string') return [value];
    if (!value || typeof value !== 'object') return [];
    return Object.values(value).flatMap(packagePaths);
}

for (const dir of packageDirs) {
    console.log(`Checking package contents in ${dir}`);
    const result = spawnSync('npm', ['pack', '--dry-run', '--json', '.'], {
        cwd: dir,
        encoding: 'utf8',
    });
    if (result.status !== 0) {
        if (result.stdout) process.stdout.write(result.stdout);
        if (result.stderr) process.stderr.write(result.stderr);
        process.exit(result.status ?? 1);
    }

    const packageJson = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
    const pack = JSON.parse(result.stdout)[0];
    const files = new Set(pack.files.map((file) => file.path));
    for (const required of ['package.json', 'README.md', 'LICENSE']) {
        if (!files.has(required)) throw new Error(`${packageJson.name} tarball is missing ${required}.`);
    }
    for (const entry of [
        packageJson.main,
        packageJson.module,
        packageJson.types,
        ...Object.values(packageJson.bin ?? {}),
        ...packagePaths(packageJson.exports),
    ].filter(Boolean)) {
        const file = entry.replace(/^\.\//, '');
        if (!files.has(file)) throw new Error(`${packageJson.name} tarball is missing entry ${file}.`);
    }
    if (packageJson.name.startsWith('@') && packageJson.publishConfig?.access !== 'public') {
        throw new Error(`${packageJson.name} must publish with public access.`);
    }
}
