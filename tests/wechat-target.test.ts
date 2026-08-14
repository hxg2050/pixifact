import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    buildPixifactTarget,
    devPixifactTarget,
    PixifactTargetError,
    validatePixifactTarget,
} from '../packages/pixifact-cli/src/viteTarget';

const checkedInSampleRoot = path.join(process.cwd(), 'sample-projects', 'wechat-minigame-demo');
let fixtureRoot: string;
let sampleRoot: string;

beforeAll(async () => {
    fixtureRoot = await mkdtemp(path.join(process.cwd(), '.pixifact-wechat-target-'));
    sampleRoot = path.join(fixtureRoot, 'sample');
    await cp(checkedInSampleRoot, sampleRoot, { recursive: true });
});

afterAll(async () => {
    await rm(fixtureRoot, { recursive: true, force: true });
});

async function createInvalidProject() {
    const root = await mkdtemp(path.join(tmpdir(), 'pixifact-wechat-target-'));
    await mkdir(path.join(root, 'src/scenes'), { recursive: true });
    await mkdir(path.join(root, 'platforms/wechat'), { recursive: true });
    await mkdir(path.join(root, 'resources/ui'), { recursive: true });
    await writeFile(path.join(root, 'src/main.ts'), 'export {};\n');
    await writeFile(path.join(root, 'src/scenes/Main.ts'), [
        "import { Group } from 'pixifact/runtime';",
        "import { scene } from 'pixifact/scene';",
        '@scene()',
        'export class Main extends Group {}',
        '',
    ].join('\n'));
    await writeFile(path.join(root, 'src/scenes/Main.scene'), [
        '<Scene name="Main">',
        '  <Sprite id="logo" texture="resources/ui/logo.svg" />',
        '  <Sprite id="missing" texture="resources/ui/missing.png" />',
        '  <HTMLText id="rich" text="Unsupported" />',
        '</Scene>',
        '',
    ].join('\n'));
    await writeFile(path.join(root, 'resources/ui/logo.svg'), '<svg />\n');
    await writeFile(path.join(root, 'platforms/wechat/game.json'), '{}\n');
    await writeFile(path.join(root, 'platforms/wechat/project.config.json'), '{}\n');
    await writeFile(path.join(root, '.env.wechat'), 'VITE_PLATFORM=wechat\nVITE_APP_ID=test-appid\n');
    await writeFile(path.join(root, 'pixifact.project.json'), JSON.stringify({
        version: 2,
        name: 'Invalid WeChat Target',
        scenes: { main: 'src/scenes/Main.scene' },
        resourcePacks: ['ui'],
    }));
    await writeFile(path.join(root, 'vite.config.ts'), viteConfigSource(root));
    return root;
}

function viteConfigSource(root: string) {
    const source = path.join(process.cwd(), 'packages/pixifact/src/compiler-node/index.ts');
    return [
        `import { pixifact } from ${JSON.stringify(source)};`,
        `export default { plugins: [pixifact({ projectRoot: ${JSON.stringify(root)} })] };`,
        '',
    ].join('\n');
}

describe('WeChat Mini Game target', () => {
    it('validates and builds the one-entry sample through Vite', async () => {
        const validation = await validatePixifactTarget(sampleRoot, 'wechat');
        expect(validation.diagnostics).toEqual([]);
        expect(validation.platform).toBe('wechat');

        const report = await buildPixifactTarget(sampleRoot, 'wechat');
        const gameJson = JSON.parse(await readFile(path.join(report.outputDirectory, 'game.json'), 'utf8'));
        expect(gameJson.subpackages).toEqual([{
            name: 'demo-level',
            root: 'subpackages/demo-level',
        }]);
        await expect(readFile(
            path.join(report.outputDirectory, 'subpackages/demo-level/level.json'),
            'utf8',
        )).resolves.toContain('demo-level');
    }, 30_000);

    it('evaluates the bundle before wx startup without browser globals', async () => {
        const report = await buildPixifactTarget(sampleRoot, 'wechat');
        const bundle = await readFile(path.join(report.outputDirectory, 'game.js'), 'utf8');
        const startupSentinel = new Error('canvas.getContext reached');
        const errors: unknown[][] = [];

        expect(bundle.startsWith('var Intl=globalThis.Intl||{}')).toBe(true);
        runInNewContext(bundle, {
            console: {
                error: (...args: unknown[]) => errors.push(args),
                info: () => undefined,
            },
            Intl: undefined,
            wx: {
                createCanvas() {
                    return {
                        getContext() { throw startupSentinel; },
                        height: 1,
                        width: 1,
                    };
                },
            },
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(errors).toEqual([['[pixifact-wechat] Failed to start', startupSentinel]]);
    }, 30_000);

    it('reports unsupported nodes, textures, and missing resources', async () => {
        const root = await createInvalidProject();
        try {
            const result = await validatePixifactTarget(root, 'wechat');
            const messages = result.diagnostics.map((diagnostic) => diagnostic.message);
            expect(messages).toContain('wechat 小游戏不支持 SVG 资源。');
            expect(messages).toContain('wechat 小游戏 Scene 纹理不支持 .svg 格式。');
            expect(messages).toContain('wechat 小游戏 Scene 纹理文件不存在。');
            expect(messages).toContain('wechat 小游戏不支持 HTMLText。');
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it('preserves diagnostics when dev validation fails', async () => {
        const root = await createInvalidProject();
        await rm(path.join(root, 'src/main.ts'));
        try {
            await expect(devPixifactTarget(root, 'wechat')).rejects.toBeInstanceOf(PixifactTargetError);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
