import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateWechatTarget } from '../packages/pixifact-cli/src/wechatTarget';

const sampleRoot = join(process.cwd(), 'sample-projects', 'wechat-minigame-demo');

describe('WeChat Mini Game target', () => {
    it('validates the checked-in WeChat sample target', async () => {
        const result = await validateWechatTarget(sampleRoot);

        expect(result.diagnostics).toEqual([]);
        expect(result.context.target.outDir).toBe('dist/wechat');
    });

    it('reports unsupported Scene nodes, invalid textures, and bad subpackages', async () => {
        const root = await mkdtemp(join(tmpdir(), 'pixifact-wechat-target-'));
        try {
            await mkdir(join(root, 'src', 'scenes'), { recursive: true });
            await mkdir(join(root, 'src', 'wechat'), { recursive: true });
            await mkdir(join(root, 'platforms', 'wechat'), { recursive: true });
            await mkdir(join(root, 'resources', 'ui'), { recursive: true });
            await writeFile(join(root, 'src', 'wechat', 'main.ts'), 'export {};\n');
            await writeFile(join(root, 'src', 'scenes', 'Main.ts'), [
                "import { Group } from 'pixifact/runtime';",
                "import { scene } from 'pixifact/scene';",
                '@scene()',
                'export class Main extends Group {}',
                '',
            ].join('\n'));
            await writeFile(join(root, 'src', 'scenes', 'Main.scene'), [
                '<Scene name="Main">',
                '  <Sprite id="logo" texture="resources/ui/logo.svg" />',
                '  <Sprite id="missing" texture="resources/ui/missing.png" />',
                '  <HTMLText id="rich" text="Unsupported" />',
                '  <DOMContainer id="dom" />',
                '</Scene>',
                '',
            ].join('\n'));
            await writeFile(join(root, 'resources', 'ui', 'logo.svg'), '<svg />\n');
            await writeFile(join(root, 'platforms', 'wechat', 'game.json'), JSON.stringify({
                subpackages: [{ name: 'ui', root: 'wrong-root' }],
            }));
            await writeFile(join(root, 'platforms', 'wechat', 'project.config.json'), '{}\n');
            await writeFile(join(root, 'pixifact.project.json'), JSON.stringify({
                version: 1,
                name: 'Invalid WeChat Target',
                scenes: {
                    main: 'src/scenes/Main.scene',
                },
                resourcePacks: {
                    ui: { root: 'resources/ui' },
                },
                targets: {
                    wechat: {
                        entry: 'src/wechat/main.ts',
                        configDir: 'platforms/wechat',
                        outDir: 'dist/wechat',
                        resourcePacks: {
                            ui: {
                                delivery: 'subpackage',
                                root: 'subpackages/ui',
                            },
                        },
                    },
                },
            }, null, 2));

            const result = await validateWechatTarget(root);
            const messages = result.diagnostics.map((diagnostic) => diagnostic.message);

            expect(messages).toContain('微信小游戏目标不支持 SVG 资源。');
            expect(messages).toContain('微信小游戏 Scene 纹理不支持 .svg 格式。');
            expect(messages).toContain('微信小游戏 Scene 纹理文件不存在。');
            expect(messages).toContain('微信小游戏目标不支持 HTMLText。');
            expect(messages).toContain('微信小游戏目标不支持 DOMContainer。');
            expect(messages).toContain('game.json 必须声明分包 ui，root 为 subpackages/ui。');

            const svgDiagnostic = result.diagnostics.find((diagnostic) =>
                diagnostic.message.includes('Scene 纹理')
            );
            expect(svgDiagnostic).toMatchObject({
                asset: 'resources/ui/logo.svg',
                node: '0:logo',
                scene: 'src/scenes/Main.scene',
            });
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it('requires HTTPS for remote resource packs', async () => {
        const config = JSON.parse(await readFile(join(sampleRoot, 'pixifact.project.json'), 'utf8'));
        config.targets.wechat.resourcePacks['demo-level'] = {
            delivery: 'remote',
            baseUrl: 'http://cdn.example.com/demo-level',
        };
        const root = await mkdtemp(join(tmpdir(), 'pixifact-wechat-remote-'));
        try {
            await mkdir(join(root, 'src', 'scenes'), { recursive: true });
            await mkdir(join(root, 'src', 'wechat'), { recursive: true });
            await mkdir(join(root, 'platforms', 'wechat'), { recursive: true });
            await mkdir(join(root, 'resources', 'demo-level'), { recursive: true });
            await writeFile(join(root, 'pixifact.project.json'), JSON.stringify(config));
            await writeFile(join(root, 'src', 'wechat', 'main.ts'), 'export {};\n');
            await writeFile(join(root, 'src', 'scenes', 'Main.scene'), '<Scene name="Main" />\n');
            await writeFile(join(root, 'platforms', 'wechat', 'game.json'), '{}\n');
            await writeFile(join(root, 'platforms', 'wechat', 'project.config.json'), '{}\n');

            const result = await validateWechatTarget(root);

            expect(result.diagnostics).toContainEqual({
                message: '远程资源包 demo-level 的 baseUrl 必须使用 HTTPS。',
            });
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
