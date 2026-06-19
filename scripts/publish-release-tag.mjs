#!/usr/bin/env bun
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const packageFiles = [
    'packages/pixifact/package.json',
    'packages/pixifact-cli/package.json',
    'packages/create-pixifact/package.json',
];

async function readJson(file) {
    return JSON.parse(await readFile(file, 'utf8'));
}

const packages = await Promise.all(packageFiles.map(readJson));
const versions = new Set(packages.map((pkg) => pkg.version));

if (versions.size !== 1) {
    throw new Error(`Release package versions must match: ${packages.map((pkg) => `${pkg.name}@${pkg.version}`).join(', ')}`);
}

const version = packages[0].version;
const tag = `v${version}`;
const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' });

if (status.trim() !== '') {
    throw new Error('Working tree must be clean before publishing a release tag.');
}

execFileSync('git', ['tag', tag], { stdio: 'inherit' });
execFileSync('git', ['push', 'origin', 'main'], { stdio: 'inherit' });
execFileSync('git', ['push', 'origin', tag], { stdio: 'inherit' });

console.log(`Pushed ${tag}. GitHub Actions will publish npm packages through Trusted Publishing.`);
