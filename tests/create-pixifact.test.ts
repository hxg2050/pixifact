import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
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
                'compile:scenes': 'pixifact compile-scenes --project-root .',
                dev: 'bun run compile:scenes && vite . --host 127.0.0.1 --port 5177 --strictPort',
                build: 'bun run compile:scenes && vite build . --config vite.config.ts',
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
        expect(await readProjectFile(projectRoot, 'vite.config.ts')).toContain("from 'pixifact/compiler-node'");
        expect(await readProjectFile(projectRoot, 'vite.config.ts')).not.toContain('packages/pixifact/src');
        expect(await readProjectFile(projectRoot, 'src/scenes/MainMenu.scene')).not.toContain('script=');
        expect(await readProjectFile(projectRoot, 'src/scenes/MainMenu.ts')).toContain('export class MainMenu');
        expect(await readProjectFile(projectRoot, 'src/scenes/MainMenu.ts')).toContain('extends Group');
        expect(JSON.parse(await readProjectFile(projectRoot, 'pixifact.project.json'))).toMatchObject({
            name: 'My Game',
            resolution: {
                width: 750,
                height: 1334,
            },
            scenes: {
                mainMenu: 'src/scenes/MainMenu.scene',
            },
            run: {
                command: 'bun',
                args: ['run', 'dev'],
                cwd: '.',
                url: 'http://127.0.0.1:5177',
            },
        });
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
