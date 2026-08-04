#!/usr/bin/env bun
import { spawn, spawnSync } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const sampleRelativeRoot = 'sample-projects/adventure-ui-demo';

function run(command, args, options = {}) {
    console.log(`> ${command} ${args.join(' ')}`);
    const result = spawnSync(command, args, {
        cwd: options.cwd ?? repoRoot,
        env: options.env ?? process.env,
        encoding: 'utf8',
    });
    if (result.status !== 0) {
        if (result.stdout) process.stdout.write(result.stdout);
        if (result.stderr) process.stderr.write(result.stderr);
        throw new Error(`${command} exited with status ${result.status ?? 'unknown'}.`);
    }
    if (!options.silent) {
        if (result.stdout) process.stdout.write(result.stdout);
        if (result.stderr) process.stderr.write(result.stderr);
    }
    return result.stdout;
}

function packPackage(packageDirectory, destination) {
    const output = run('npm', ['pack', '--json', '--pack-destination', destination, '.'], {
        cwd: path.join(repoRoot, packageDirectory),
        silent: true,
    });
    const packResult = JSON.parse(output);
    const tarball = path.join(destination, packResult[0].filename);
    console.log(`Packed ${packageDirectory} -> ${path.basename(tarball)}`);
    return tarball;
}

async function copyTrackedSample(destination) {
    const output = run('git', ['ls-files', '-z', '--', sampleRelativeRoot], { silent: true });
    const files = output.split('\0').filter(Boolean);
    for (const file of files) {
        const relativePath = path.relative(sampleRelativeRoot, file);
        const target = path.join(destination, relativePath);
        await mkdir(path.dirname(target), { recursive: true });
        await copyFile(path.join(repoRoot, file), target);
    }
}

async function createBrowserCommandStub(directory) {
    if (process.platform === 'win32') return process.env.PATH;
    const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
    const file = path.join(directory, command);
    await writeFile(file, '#!/bin/sh\nexit 0\n');
    await chmod(file, 0o755);
    return `${directory}${path.delimiter}${process.env.PATH ?? ''}`;
}

async function verifyEditor(projectRoot, stubDirectory) {
    console.log('> bun run pixifact editor --project-root .');
    const child = spawn('bun', ['run', 'pixifact', 'editor', '--project-root', '.'], {
        cwd: projectRoot,
        env: {
            ...process.env,
            PATH: await createBrowserCommandStub(stubDirectory),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
        stdout += chunk;
        process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
        stderr += chunk;
    });

    try {
        const url = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Editor did not report a URL.\n${stderr}`));
            }, 10_000);
            const inspectOutput = () => {
                const match = stdout.match(/"url":\s*"(http:\/\/127\.0\.0\.1:\d+)"/);
                if (!match) return;
                clearTimeout(timeout);
                resolve(match[1]);
            };
            child.stdout.on('data', inspectOutput);
            child.once('exit', (code) => {
                clearTimeout(timeout);
                reject(new Error(`Editor exited before startup with status ${code ?? 'unknown'}.\n${stderr}`));
            });
        });
        const response = await fetch(url);
        const html = await response.text();
        if (!response.ok || !html.includes('<div id="app">')) {
            throw new Error(`Editor frontend at ${url} did not return the expected HTML.`);
        }
    } finally {
        child.kill('SIGTERM');
        await new Promise((resolve) => {
            if (child.exitCode !== null || child.signalCode !== null) {
                resolve();
                return;
            }
            child.once('exit', resolve);
        });
    }
}

const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'pixifact-release-install-'));

try {
    const artifactsRoot = path.join(temporaryRoot, 'artifacts');
    const projectRoot = path.join(temporaryRoot, 'adventure-ui-demo');
    const browserStubRoot = path.join(temporaryRoot, 'browser-stub');
    await mkdir(artifactsRoot, { recursive: true });
    await mkdir(projectRoot, { recursive: true });
    await mkdir(browserStubRoot, { recursive: true });

    const pixifactTarball = packPackage('packages/pixifact', artifactsRoot);
    const cliTarball = packPackage('packages/pixifact-cli', artifactsRoot);
    await copyTrackedSample(projectRoot);

    const packageJsonPath = path.join(projectRoot, 'package.json');
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
    packageJson.dependencies.pixifact = `file:${pixifactTarball}`;
    packageJson.devDependencies['pixifact-cli'] = `file:${cliTarball}`;
    packageJson.overrides = {
        pixifact: `file:${pixifactTarball}`,
    };
    await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

    run('bun', ['install'], { cwd: projectRoot });
    run('bun', ['run', 'pixifact', '--help'], { cwd: projectRoot, silent: true });
    run('bun', ['run', 'pixifact', 'summary'], { cwd: projectRoot, silent: true });
    run('bun', ['run', 'pixifact', 'scene', 'inspect', '--scene', 'src/scenes/BottomMenu.scene'], { cwd: projectRoot, silent: true });
    run('bun', ['run', 'pixifact', 'scene', 'validate', '--all'], { cwd: projectRoot, silent: true });
    run('bun', ['run', 'compile:scenes'], { cwd: projectRoot, silent: true });
    run('bun', ['run', 'build'], { cwd: projectRoot });
    await verifyEditor(projectRoot, browserStubRoot);

    console.log('Release install smoke passed.');
} finally {
    await rm(temporaryRoot, { recursive: true, force: true });
}
