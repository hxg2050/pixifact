import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cwd } from 'node:process';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
    buildDouyinTarget,
    devDouyinTarget,
    DouyinTargetError,
    validateDouyinTarget,
} from '../packages/pixifact-cli/src/douyinTarget';
import { douyinTargetDescriptor } from '../packages/pixifact-cli/src/miniGameTarget';

async function createProject(gameJson: object) {
    const root = await mkdtemp(join(tmpdir(), 'pixifact-douyin-target-'));
    await mkdir(join(root, 'src', 'scenes'), { recursive: true });
    await mkdir(join(root, 'src', 'douyin'), { recursive: true });
    await mkdir(join(root, 'platforms', 'douyin'), { recursive: true });
    await mkdir(join(root, 'resources', 'chapter1'), { recursive: true });
    await writeFile(join(root, 'src', 'douyin', 'main.ts'), 'export {};\n');
    await writeFile(join(root, 'src', 'scenes', 'Main.scene'), '<Scene name="Main" />\n');
    await writeFile(join(root, 'platforms', 'douyin', 'game.json'), JSON.stringify(gameJson));
    await writeFile(join(root, 'platforms', 'douyin', 'project.config.json'), '{}\n');
    await writeFile(join(root, 'pixifact.project.json'), JSON.stringify({
        version: 1,
        name: 'Douyin Target',
        scenes: { main: 'src/scenes/Main.scene' },
        resourcePacks: { chapter1: { root: 'resources/chapter1' } },
        targets: {
            douyin: {
                entry: 'src/douyin/main.ts',
                configDir: 'platforms/douyin',
                outDir: 'dist/douyin',
                resourcePacks: {
                    chapter1: { delivery: 'subpackage', root: 'subpackages/chapter1' },
                },
            },
        },
    }));
    return root;
}

describe('Douyin Mini Game target', () => {
    it('builds the checked-in three-target sample for Douyin', async () => {
        const sampleRoot = join(cwd(), 'sample-projects', 'wechat-minigame-demo');
        const report = await buildDouyinTarget(sampleRoot, 'production');
        const output = report.outputDirectory;
        const gameJson = JSON.parse(await readFile(join(output, 'game.json'), 'utf8'));

        expect(gameJson.subPackages).toEqual([{
            name: 'demo-level',
            root: 'subpackages/demo-level',
        }]);
        await expect(readFile(join(output, 'game.js'), 'utf8')).resolves.toContain('DouyinMiniGame');
        await expect(readFile(join(output, 'subpackages', 'demo-level', 'level.json'), 'utf8')).resolves.toContain('demo-level');
    });

    it('evaluates the bundle before tt startup without browser globals', async () => {
        const sampleRoot = join(cwd(), 'sample-projects', 'wechat-minigame-demo');
        const report = await buildDouyinTarget(sampleRoot, 'production');
        const bundle = await readFile(join(report.outputDirectory, 'game.js'), 'utf8');
        const startupSentinel = new Error('canvas.getContext reached');
        const errors: unknown[][] = [];

        expect(bundle.startsWith('var Intl=globalThis.Intl||{};\n')).toBe(true);
        runInNewContext(bundle, {
            console: {
                error: (...args: unknown[]) => errors.push(args),
                info: () => undefined,
            },
            Intl: undefined,
            tt: {
                createCanvas() {
                    return {
                        getContext() {
                            throw startupSentinel;
                        },
                        height: 1,
                        width: 1,
                    };
                },
            },
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(errors).toEqual([[
            '[pixifact-douyin] Failed to start',
            startupSentinel,
        ]]);
    });

    it('only applies the 4 MiB main package limit when subpackages are configured', () => {
        expect(douyinTargetDescriptor.mainPackageLimit(false)).toBeUndefined();
        expect(douyinTargetDescriptor.mainPackageLimit(true)).toBe(4 * 1024 * 1024);
        expect(douyinTargetDescriptor.totalPackageLimit).toBe(20 * 1024 * 1024);
    });

    it('validates the Douyin subPackages declaration', async () => {
        const root = await createProject({
            subPackages: [{ name: 'chapter1', root: 'subpackages/chapter1' }],
        });
        try {
            const result = await validateDouyinTarget(root);

            expect(result.diagnostics).toEqual([]);
            expect(result.context.target.outDir).toBe('dist/douyin');
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it('rejects the WeChat-style lowercase subpackages field', async () => {
        const root = await createProject({
            subpackages: [{ name: 'chapter1', root: 'subpackages/chapter1' }],
        });
        try {
            const result = await validateDouyinTarget(root);

            expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
                'game.json 必须声明抖音分包 chapter1，root 为 subpackages/chapter1。',
            );
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it('preserves platform diagnostics when dev validation fails', async () => {
        const root = await createProject({});
        try {
            await expect(devDouyinTarget(root)).rejects.toBeInstanceOf(DouyinTargetError);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
