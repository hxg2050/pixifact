#!/usr/bin/env bun
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { access, chmod, copyFile, mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const multiPlatformSampleRoot = 'sample-projects/wechat-minigame-demo';

function commandEnv(env = process.env) {
    const currentPath = env.PATH ?? env.Path ?? '';
    return {
        ...env,
        PATH: `${path.dirname(process.execPath)}${path.delimiter}${currentPath}`,
    };
}

function run(command, args, options = {}) {
    console.log(`> ${command} ${args.join(' ')}`);
    const result = spawnSync(command === 'bun' ? process.execPath : command, args, {
        cwd: options.cwd ?? repoRoot,
        env: commandEnv(options.env),
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

async function copyProject(sourceRoot, destination) {
    const output = run('git', [
        'ls-files',
        '--cached',
        '--others',
        '--exclude-standard',
        '-z',
        '--',
        sourceRoot,
    ], { silent: true });
    const files = output.split('\0').filter(Boolean);
    for (const file of files) {
        const source = path.join(repoRoot, file);
        if (!await exists(source)) continue;
        const relativePath = path.relative(sourceRoot, file);
        const target = path.join(destination, relativePath);
        await mkdir(path.dirname(target), { recursive: true });
        await copyFile(source, target);
    }
}

async function exists(file) {
    try {
        await access(file);
        return true;
    } catch {
        return false;
    }
}

async function configurePackedProject(projectRoot, artifacts, platformNames = []) {
    const packageJsonPath = path.join(projectRoot, 'package.json');
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
    packageJson.dependencies.pixifact = `file:${artifacts.pixifact}`;
    delete packageJson.dependencies['@pixifact/platform-wechat'];
    delete packageJson.dependencies['@pixifact/platform-douyin'];
    for (const platformName of platformNames) {
        packageJson.dependencies[`@pixifact/platform-${platformName}`] = `file:${artifacts[platformName]}`;
    }
    packageJson.devDependencies['pixifact-cli'] = `file:${artifacts.cli}`;
    packageJson.overrides = {
        pixifact: `file:${artifacts.pixifact}`,
    };
    packageJson.scripts.build = 'pixifact build --mode web --project-root .';
    await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
    await writeFile(path.join(projectRoot, 'vite.config.ts'), [
        "import { defineConfig } from 'vite';",
        "import { pixifact } from 'pixifact/compiler-node';",
        '',
        'export default defineConfig({ plugins: [pixifact()] });',
        '',
    ].join('\n'));
}

async function verifyMiniGameBuild(projectRoot, mode, excludedMarker) {
    run('bun', ['run', 'pixifact', 'validate', '--mode', mode], { cwd: projectRoot, silent: true });
    run('bun', ['run', 'pixifact', 'build', '--mode', mode], { cwd: projectRoot });
    const bundle = await readFile(path.join(projectRoot, 'dist', mode, 'game.js'), 'utf8');
    if (bundle.includes(excludedMarker)) {
        throw new Error(`${mode} bundle contains non-target marker ${excludedMarker}.`);
    }
}

async function verifyScaffold(temporaryRoot, tarball) {
    const installRoot = path.join(temporaryRoot, 'scaffold');
    await mkdir(installRoot);
    await writeFile(path.join(installRoot, 'package.json'), JSON.stringify({
        private: true,
        dependencies: { 'create-pixifact': `file:${tarball}` },
    }));
    run('bun', ['install'], { cwd: installRoot });
    run('bun', ['run', 'create-pixifact', 'my-game'], { cwd: installRoot });

    const projectRoot = path.join(installRoot, 'my-game');
    assert.equal(run('git', ['rev-parse', '--show-toplevel'], { cwd: projectRoot, silent: true }).trim(), await realpath(projectRoot));
    await access(path.join(projectRoot, '.gitignore'));
    const sourceRoot = path.join(repoRoot, 'skills/pixifact');
    const installedRoot = path.join(projectRoot, '.agents/skills/pixifact');
    const entries = await readdir(sourceRoot, { recursive: true });
    assert.deepEqual((await readdir(installedRoot, { recursive: true })).sort(), entries.sort());
    for (const entry of entries) {
        if (!(await stat(path.join(sourceRoot, entry))).isFile()) continue;
        assert.equal(await readFile(path.join(installedRoot, entry), 'utf8'), await readFile(path.join(sourceRoot, entry), 'utf8'));
    }
    console.log('Packed scaffold Git and project skill smoke passed.');
}

async function createBrowserCommandStub(directory) {
    if (process.platform === 'win32') return process.env.PATH;
    const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
    const file = path.join(directory, command);
    await writeFile(file, '#!/bin/sh\nexit 0\n');
    await chmod(file, 0o755);
    return `${directory}${path.delimiter}${process.env.PATH ?? ''}`;
}

function stopEditorProcess(child) {
    if (process.platform === 'win32') {
        if (child.pid === undefined) {
            throw new Error('Editor process did not expose a pid.');
        }
        const result = spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f']);
        if (result.status !== 0) {
            throw new Error(`taskkill exited with status ${result.status ?? 'unknown'}.`);
        }
        return;
    }
    child.kill('SIGTERM');
}

async function verifyEditor(projectRoot, stubDirectory) {
    console.log('> bun run pixifact editor --project-root .');
    const child = spawn(process.execPath, ['run', 'pixifact', 'editor', '--project-root', '.'], {
        cwd: projectRoot,
        env: commandEnv({
            ...process.env,
            PATH: await createBrowserCommandStub(stubDirectory),
        }),
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
        stopEditorProcess(child);
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
    const projectRoot = path.join(temporaryRoot, 'web-only');
    const browserStubRoot = path.join(temporaryRoot, 'browser-stub');
    await mkdir(artifactsRoot, { recursive: true });
    await mkdir(projectRoot, { recursive: true });
    await mkdir(browserStubRoot, { recursive: true });

    const pixifactTarball = packPackage('packages/pixifact', artifactsRoot);
    const cliTarball = packPackage('packages/pixifact-cli', artifactsRoot);
    const wechatTarball = packPackage('packages/platform-wechat', artifactsRoot);
    const douyinTarball = packPackage('packages/platform-douyin', artifactsRoot);
    const scaffoldTarball = packPackage('packages/create-pixifact', artifactsRoot);
    const artifacts = {
        pixifact: pixifactTarball,
        cli: cliTarball,
        wechat: wechatTarball,
        douyin: douyinTarball,
    };

    await verifyScaffold(temporaryRoot, scaffoldTarball);

    await copyProject(multiPlatformSampleRoot, projectRoot);
    await configurePackedProject(projectRoot, artifacts);

    run('bun', ['install'], { cwd: projectRoot });
    if (await exists(path.join(projectRoot, 'node_modules', '@pixifact', 'platform-wechat'))
        || await exists(path.join(projectRoot, 'node_modules', '@pixifact', 'platform-douyin'))) {
        throw new Error('Web-only install unexpectedly contains a Mini Game platform package.');
    }
    run('bun', ['run', 'pixifact', '--help'], { cwd: projectRoot, silent: true });
    run('bun', ['run', 'pixifact', 'summary'], { cwd: projectRoot, silent: true });
    run('bun', ['run', 'pixifact', 'scene', 'inspect', '--scene', 'src/scenes/Main.scene'], { cwd: projectRoot, silent: true });
    run('bun', ['run', 'pixifact', 'scene', 'validate', '--all'], { cwd: projectRoot, silent: true });
    run('bun', ['run', 'pixifact', 'compile-scenes'], { cwd: projectRoot, silent: true });
    run('bun', ['run', 'build'], { cwd: projectRoot });
    await verifyEditor(projectRoot, browserStubRoot);

    for (const platformNames of [['wechat'], ['douyin'], ['wechat', 'douyin']]) {
        const isolatedRoot = path.join(temporaryRoot, platformNames.join('-'));
        await mkdir(isolatedRoot, { recursive: true });
        await copyProject(multiPlatformSampleRoot, isolatedRoot);
        await configurePackedProject(isolatedRoot, artifacts, platformNames);
        run('bun', ['install'], { cwd: isolatedRoot });
        if (platformNames.includes('wechat')) {
            await verifyMiniGameBuild(isolatedRoot, 'wechat', 'DouyinMiniGame');
        }
        if (platformNames.includes('douyin')) {
            await verifyMiniGameBuild(isolatedRoot, 'douyin', 'WeChatMiniGame');
        }
    }

    console.log('Release install smoke passed.');
} finally {
    await rm(temporaryRoot, { recursive: true, force: true });
}
