import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPixifactProject } from '../packages/create-pixifact/src/createPixifactProject';
import pixifactPackage from '../packages/pixifact/package.json' with { type: 'json' };
import pixifactCliPackage from '../packages/pixifact-cli/package.json' with { type: 'json' };

const tempRoots: string[] = [];

async function makeTempRoot() {
    const root = await mkdtemp(join(tmpdir(), 'create-pixifact-'));
    tempRoots.push(root);
    return root;
}

async function readProjectFile(projectRoot: string, filePath: string) {
    return readFile(join(projectRoot, filePath), 'utf8');
}

describe('create-pixifact scaffold', () => {
    afterEach(async () => {
        vi.unstubAllEnvs();
        await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
    });

    it('creates a minimal standalone Pixifact game project', async () => {
        const cwd = await makeTempRoot();

        const result = await createPixifactProject({
            cwd,
            name: 'my-game',
        });

        const projectRoot = join(cwd, 'my-game');
        expect(result).toEqual({
            name: 'my-game',
            root: projectRoot,
            template: 'minimal',
        });
        expect(JSON.parse(await readProjectFile(projectRoot, 'package.json'))).toMatchObject({
            name: 'my-game',
            type: 'module',
            scripts: {
                dev: 'bun --inspect ./node_modules/.bin/pixifact dev --mode development --project-root .',
                build: 'pixifact build --mode production --project-root .',
                compile: 'pixifact compile-scenes --project-root .',
                editor: 'pixifact editor --project-root .',
                validate: 'pixifact validate --mode production --project-root .',
            },
            dependencies: {
                'pixi.js': '8.18.1',
                pixifact: `^${pixifactPackage.version}`,
            },
            devDependencies: {
                'pixifact-cli': `^${pixifactCliPackage.version}`,
                typescript: '^5.3.3',
                vite: '^8.0.10',
            },
        });
        const viteConfig = await readProjectFile(projectRoot, 'vite.config.ts');
        expect(viteConfig).toContain("from 'pixifact/compiler-node'");
        expect(viteConfig).toContain('pixifact()');
        expect(viteConfig).toContain('pixifactRuntimePlugin()');
        expect(await readProjectFile(projectRoot, 'vite.config.ts')).not.toContain('packages/pixifact/src');
        expect(await readProjectFile(projectRoot, 'src/scenes/MainMenu.scene')).not.toContain('script=');
        expect(await readProjectFile(projectRoot, 'src/scenes/MainMenu.ts')).toContain('export class MainMenu');
        expect(await readProjectFile(projectRoot, 'src/scenes/MainMenu.ts')).toContain('extends Group');
        const mainSource = await readProjectFile(projectRoot, 'src/main.ts');
        expect(mainSource).toContain("from 'pixifact:platform'");
        expect(mainSource).toContain("from 'pixifact:assets'");
        expect(mainSource).toContain("import('pixifact/runtime-dev')");
        expect(mainSource).toContain('registerPixiRuntime(app, { getState: () => scene.snapshot() })');
        expect(await readProjectFile(projectRoot, 'src/scenes/MainMenu.ts')).toContain('snapshot()');
        expect((await readProjectFile(projectRoot, '.env')).replaceAll('\r\n', '\n')).toBe('VITE_PLATFORM=web\n');
        expect((await readProjectFile(projectRoot, 'bunfig.toml')).replaceAll('\r\n', '\n')).toBe('env = false\n');
        expect(await readProjectFile(projectRoot, 'src/vite-env.d.ts')).toContain('pixifact/client');
        expect(mainSource).toContain("from '../pixifact.project.json'");
        expect(mainSource).toContain('calculatePixifactViewportLayout');
        expect(mainSource).toContain('applyPixifactViewportLayout');
        expect(mainSource).toContain('new ResizeObserver(resizeViewport)');
        expect(JSON.parse(await readProjectFile(projectRoot, 'tsconfig.json'))).toMatchObject({
            compilerOptions: {
                resolveJsonModule: true,
                allowSyntheticDefaultImports: true,
            },
        });
        expect(JSON.parse(await readProjectFile(projectRoot, 'pixifact.project.json'))).toMatchObject({
            version: 2,
            name: 'My Game',
            resolution: {
                width: 960,
                height: 540,
            },
            viewport: {
                mode: 'showAll',
            },
            scenes: {
                mainMenu: 'src/scenes/MainMenu.scene',
            },
        });
    });

    it('initializes Git and ignores generated files while keeping the skill and source trackable', async () => {
        const cwd = await makeTempRoot();
        const { root } = await createPixifactProject({ cwd, name: 'my-game' });
        const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

        expect(git('rev-parse', '--show-toplevel')).toBe(await realpath(root));
        expect(git('ls-files')).toBe('');
        expect(git('rev-list', '--all')).toBe('');
        const ignored = ['node_modules/pkg/index.js', 'dist/web/index.html', '.pixifact/generated/scene.ts', '.env.local', '.env.development.local'];
        expect(git('check-ignore', '--', ...ignored).split('\n')).toEqual(ignored);
        const trackable = git('ls-files', '--others', '--exclude-standard').split('\n');
        expect(trackable).toEqual(expect.arrayContaining([
            '.gitignore', '.env', 'package.json', 'src/scenes/MainMenu.scene', '.agents/skills/pixifact/SKILL.md',
        ]));
    });

    it('copies the complete Pixifact skill and its offline references into the project', async () => {
        const cwd = await makeTempRoot();
        const { root } = await createPixifactProject({ cwd, name: 'my-game' });
        const sourceRoot = join(process.cwd(), 'skills/pixifact');
        const installedRoot = join(root, '.agents/skills/pixifact');
        const entries = await readdir(sourceRoot, { recursive: true });

        expect((await readdir(installedRoot, { recursive: true })).sort()).toEqual(entries.sort());
        for (const entry of entries) {
            if (!(await stat(join(sourceRoot, entry))).isFile()) continue;
            expect(await readFile(join(installedRoot, entry), 'utf8')).toBe(await readFile(join(sourceRoot, entry), 'utf8'));
        }
    });

    it('creates an independent repository inside an existing Git repository', async () => {
        const cwd = await makeTempRoot();
        execFileSync('git', ['init', '--quiet'], { cwd });

        const { root } = await createPixifactProject({ cwd, name: 'nested-game' });

        expect(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' }).trim()).toBe(await realpath(root));
        expect(execFileSync('git', ['ls-files'], { cwd, encoding: 'utf8' })).toBe('');
    });

    it('reports Git initialization failure when Git is unavailable', async () => {
        const cwd = await makeTempRoot();
        vi.stubEnv('PATH', cwd);

        await expect(createPixifactProject({ cwd, name: 'my-game' })).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('does not overwrite an existing non-empty project directory', async () => {
        const cwd = await makeTempRoot();
        await mkdir(join(cwd, 'my-game'));
        await writeFile(join(cwd, 'my-game', 'keep.txt'), 'user file\n', 'utf8');

        await expect(createPixifactProject({
            cwd,
            name: 'my-game',
        })).rejects.toThrow('Target directory is not empty.');
    });
});
