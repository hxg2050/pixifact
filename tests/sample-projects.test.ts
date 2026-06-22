import { access, readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { cwd } from 'node:process';
import { describe, expect, it } from 'vitest';
import { compileScenes } from 'pixifact/compiler-node';
import { validateSceneContent } from 'pixifact/compiler';

const repoRoot = cwd();
const sampleRoot = join(repoRoot, 'sample-projects', 'adventure-ui-demo');
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
    it('keeps the adventure UI demo as the single mobile portrait sample project', async () => {
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
            .toEqual(['adventure-ui-demo']);
    });

    it('keeps every adventure UI demo scene paired with a script', async () => {
        for (const sceneName of sceneNames) {
            await expect(exists(join(sampleRoot, 'src', 'scenes', `${sceneName}.scene`)), `${sceneName}.scene`).resolves.toBe(true);
            await expect(exists(join(sampleRoot, 'src', 'scenes', `${sceneName}.ts`)), `${sceneName}.ts`).resolves.toBe(true);
        }
    });

    it('validates and compiles the adventure UI demo scenes', async () => {
        const existingAssets = new Set(await collectFiles(sampleRoot, '.svg'));

        for (const sceneName of sceneNames) {
            const scenePath = join(sampleRoot, 'src', 'scenes', `${sceneName}.scene`);
            const content = await readFile(scenePath, 'utf8');
            const result = validateSceneContent({
                content,
                existingAssets,
            });
            expect(result.ok, sceneName).toBe(true);
        }

        await compileScenes({ projectRoot: sampleRoot });

        await expect(exists(join(sampleRoot, '.pixifact', 'generated', 'scenes.generated.ts'))).resolves.toBe(true);
    });
});
