import { access, readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { cwd } from 'node:process';
import { describe, expect, it } from 'vitest';
import { compileScenes, extractSceneScriptInterfaces } from 'pixifact/compiler-node';
import { validateSceneContent } from 'pixifact/compiler';
import pixifactPackage from '../packages/pixifact/package.json' with { type: 'json' };
import pixifactCliPackage from '../packages/pixifact-cli/package.json' with { type: 'json' };

const repoRoot = cwd();
const sampleRoot = join(repoRoot, 'sample-projects', 'adventure-ui-demo');
const wechatSampleRoot = join(repoRoot, 'sample-projects', 'wechat-minigame-demo');
const sceneNames = [
    'Main',
    'Hud',
    'BottomMenu',
    'InventoryPanel',
    'Button',
    'ItemSlot',
] as const;

async function exists(filePath: string) {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function collectFiles(root: string, suffix: string) {
    const files: string[] = [];
    async function walk(directory: string) {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            const absolutePath = join(directory, entry.name);
            if (entry.isDirectory()) {
                await walk(absolutePath);
                continue;
            }
            if (entry.isFile() && entry.name.endsWith(suffix)) {
                files.push(relative(root, absolutePath).replaceAll('\\', '/'));
            }
        }
    }
    await walk(root);
    return files.sort();
}

describe('sample projects', () => {
    it('keeps both mobile portrait sample projects discoverable', async () => {
        await expect(exists(join(sampleRoot, 'pixifact.project.json'))).resolves.toBe(true);

        const project = JSON.parse(await readFile(join(sampleRoot, 'pixifact.project.json'), 'utf8'));
        expect(project).toMatchObject({
            version: 1,
            name: 'Pixifact Adventure UI Demo',
            resolution: {
                width: 750,
                height: 1334,
            },
            viewport: {
                mode: 'fixedWidth',
            },
            scenes: {
                main: 'src/scenes/Main.scene',
            },
        });

        const sampleProjectDirectories = await readdir(join(repoRoot, 'sample-projects'), { withFileTypes: true });
        expect(sampleProjectDirectories.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort())
            .toEqual(['adventure-ui-demo', 'wechat-minigame-demo']);
    });

    it('keeps the WeChat sample importable by WeChat DevTools', async () => {
        const project = JSON.parse(await readFile(join(wechatSampleRoot, 'pixifact.project.json'), 'utf8'));
        expect(project.targets.wechat).toEqual({
            entry: 'src/wechat/main.ts',
            configDir: 'platforms/wechat',
            outDir: 'dist/wechat',
            resourcePacks: {
                'demo-level': {
                    delivery: 'subpackage',
                    root: 'subpackages/demo-level',
                },
            },
        });
        await expect(exists(join(wechatSampleRoot, 'platforms', 'wechat', 'game.json'))).resolves.toBe(true);
        await expect(exists(join(wechatSampleRoot, 'platforms', 'wechat', 'project.config.json'))).resolves.toBe(true);
        await expect(exists(join(wechatSampleRoot, 'src', 'scenes', 'Main.scene'))).resolves.toBe(true);
        await expect(exists(join(wechatSampleRoot, 'src', 'scenes', 'Main.ts'))).resolves.toBe(true);
    });

    it('keeps every adventure UI demo scene paired with a script', async () => {
        for (const sceneName of sceneNames) {
            await expect(exists(join(sampleRoot, 'src', 'scenes', `${sceneName}.scene`)), `${sceneName}.scene`).resolves.toBe(true);
            await expect(exists(join(sampleRoot, 'src', 'scenes', `${sceneName}.ts`)), `${sceneName}.ts`).resolves.toBe(true);
        }
    });

    it('keeps the adventure UI demo on public package entrypoints', async () => {
        const packageJson = JSON.parse(await readFile(join(sampleRoot, 'package.json'), 'utf8'));
        expect(packageJson.scripts['compile:scenes']).toBe('pixifact compile-scenes --project-root .');
        expect(packageJson.dependencies.pixifact).toBe(`^${pixifactPackage.version}`);
        expect(packageJson.devDependencies['pixifact-cli']).toBe(`^${pixifactCliPackage.version}`);

        const viteConfig = await readFile(join(sampleRoot, 'vite.config.ts'), 'utf8');
        expect(viteConfig).toContain("from 'pixifact/compiler-node'");
        expect(viteConfig).toContain('pixifactRuntimePlugin({ projectRoot })');
        expect(viteConfig).not.toContain('../../packages/');

        const mainSource = await readFile(join(sampleRoot, 'src', 'main.ts'), 'utf8');
        expect(mainSource).toContain("await import('pixifact/runtime-dev')");
        expect(mainSource).toContain('registerPixiRuntime(app');

        const tsconfig = await readFile(join(sampleRoot, 'tsconfig.json'), 'utf8');
        expect(tsconfig).not.toContain('../../packages/');
    });

    it('validates and compiles the adventure UI demo scenes', async () => {
        const existingAssets = new Set(await collectFiles(sampleRoot, '.svg'));
        const descriptors = extractSceneScriptInterfaces(await Promise.all(sceneNames.map(async (sceneName) => ({
            scene: `src/scenes/${sceneName}.scene`,
            fileName: join(sampleRoot, 'src', 'scenes', `${sceneName}.ts`),
            source: await readFile(join(sampleRoot, 'src', 'scenes', `${sceneName}.ts`), 'utf8'),
        }))));

        for (const sceneName of sceneNames) {
            const scene = `src/scenes/${sceneName}.scene`;
            const content = await readFile(join(sampleRoot, scene), 'utf8');
            const result = validateSceneContent({
                scene,
                content,
                existingAssets,
                sceneInterface: descriptors[scene].interface,
            });
            expect(result.ok, sceneName).toBe(true);
        }

        await compileScenes({ projectRoot: sampleRoot });

        await expect(exists(join(sampleRoot, '.pixifact', 'generated', 'scenes.generated.ts'))).resolves.toBe(true);
    });
});
