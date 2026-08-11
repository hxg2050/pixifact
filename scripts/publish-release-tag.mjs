#!/usr/bin/env bun
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const packageFiles = [
    'packages/pixifact/package.json',
    'packages/platform-wechat/package.json',
    'packages/platform-douyin/package.json',
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
const remote = execFileSync('git', ['config', '--get', 'branch.main.remote'], { encoding: 'utf8' }).trim();

if (status.trim() !== '') {
    throw new Error('Working tree must be clean before publishing a release tag.');
}

execFileSync('git', ['tag', tag], { stdio: 'inherit' });
execFileSync('git', ['push', remote, 'main'], { stdio: 'inherit' });
execFileSync('git', ['push', remote, tag], { stdio: 'inherit' });

console.log(`Pushed ${tag} to ${remote}. GitHub Actions will publish npm packages through Trusted Publishing.`);
