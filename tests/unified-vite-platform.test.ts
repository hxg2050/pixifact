import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { build, type Rollup } from 'vite';
import {
    loadPixifactEnv,
    pixifact,
    pixifactBuildReporter,
    type PixifactBuildReport,
} from 'pixifact/compiler-node';

const roots: string[] = [];
const repositoryRoot = process.cwd();
const pixifactSource = path.join(repositoryRoot, 'packages/pixifact/src');
const execFileAsync = promisify(execFile);

async function createProject() {
    const root = await mkdtemp(path.join(repositoryRoot, '.pixifact-vite-platform-'));
    roots.push(root);
    await mkdir(path.join(root, 'src'), { recursive: true });
    await mkdir(path.join(root, 'resources', 'local'), { recursive: true });
    await mkdir(path.join(root, 'resources', 'remote'), { recursive: true });
    for (const platform of ['wechat', 'douyin']) {
        await mkdir(path.join(root, 'platforms', platform), { recursive: true });
        await writeFile(path.join(root, 'platforms', platform, 'game.json'), '{}\n');
        await writeFile(path.join(root, 'platforms', platform, 'project.config.json'), '{}\n');
    }
    await writeFile(path.join(root, 'pixifact.project.json'), JSON.stringify({
        version: 2,
        name: 'Unified Vite Fixture',
        scenes: { main: 'src/scenes/Main.scene' },
        resourcePacks: ['local', 'remote'],
        remoteResourcePacks: {
            remote: 'https://cdn.example.com/game',
        },
    }, null, 2));
    await writeFile(path.join(root, 'index.html'), '<script type="module" src="/src/main.ts"></script>\n');
    await writeFile(path.join(root, 'src/main.ts'), [
        "import { createApplication } from 'pixifact:platform';",
        "import { createApplication as createWechatApplication } from '@pixifact/platform-wechat';",
        "import { createApplication as createDouyinApplication } from '@pixifact/platform-douyin';",
        "import manifest from 'pixifact:assets';",
        "console.info('pixifact-mode', import.meta.env.MODE, import.meta.env.VITE_PLATFORM, import.meta.env.VITE_APP_ID);",
        'console.info(createApplication, manifest);',
        "if (import.meta.env.VITE_PLATFORM === 'wechat') console.info(createWechatApplication);",
        "if (import.meta.env.VITE_PLATFORM === 'douyin') console.info(createDouyinApplication);",
        '',
    ].join('\n'));
    await mkdir(path.join(root, 'src/scenes'), { recursive: true });
    await writeFile(path.join(root, 'src/scenes/Main.scene'), [
        '<Scene name="Main">',
        '  <Image id="background" texture="assets/background.png" width="100" height="100" />',
        '</Scene>',
        '',
    ].join('\n'));
    await mkdir(path.join(root, 'assets'), { recursive: true });
    await writeFile(path.join(root, 'assets/background.png'), 'png');
    await writeFile(path.join(root, 'src/scenes/Main.ts'), [
        "import { Group } from 'pixifact/runtime';",
        "import { scene } from 'pixifact/scene';",
        '@scene()',
        'export class Main extends Group {}',
        '',
    ].join('\n'));
    await writeFile(path.join(root, '.env.web'), 'VITE_PLATFORM=web\n');
    await writeFile(path.join(root, '.env.wechat'), 'VITE_PLATFORM=wechat\nVITE_APP_ID=wx-app-id\n');
    await writeFile(path.join(root, '.env.douyin'), 'VITE_PLATFORM=douyin\nVITE_APP_ID=tt-app-id\n');
    await writeFile(path.join(root, 'bunfig.toml'), 'env = false\n');
    await writeFile(path.join(root, 'resources/local/config.json'), '{"delivery":"local"}\n');
    await mkdir(path.join(root, 'resources/local/fonts'), { recursive: true });
    await writeFile(path.join(root, 'resources/local/fonts/demo.fnt'), 'page id=0 file="page.png"\n');
    await writeFile(path.join(root, 'resources/local/fonts/page.png'), 'png');
    await writeFile(path.join(root, 'resources/local/music.mp3'), 'mp3');
    await writeFile(path.join(root, 'resources/remote/config.json'), '{"delivery":"remote"}\n');
    return root;
}

function aliases() {
    return [
        {
            find: '@pixifact/platform-wechat',
            replacement: path.join(repositoryRoot, 'packages/platform-wechat/src/index.ts'),
        },
        {
            find: '@pixifact/platform-douyin',
            replacement: path.join(repositoryRoot, 'packages/platform-douyin/src/index.ts'),
        },
        {
            find: 'pixifact/internal/minigame',
            replacement: path.join(pixifactSource, 'platform/minigame/index.ts'),
        },
        {
            find: /^pixifact\/(.+)$/,
            replacement: `${pixifactSource}/$1`,
        },
        {
            find: 'pixifact',
            replacement: path.join(pixifactSource, 'index.ts'),
        },
    ];
}

async function buildMode(root: string, mode: 'web' | 'wechat' | 'douyin') {
    let dedupe: string[] = [];
    let target: string | string[] | false = false;
    let report: PixifactBuildReport | undefined;
    await build({
        root,
        mode,
        configFile: false,
        logLevel: 'silent',
        plugins: [
            pixifact({ projectRoot: root }),
            pixifactBuildReporter(mode, (value) => {
                report = value;
            }),
            {
                name: 'capture-build-target',
                configResolved(config) {
                    dedupe = config.resolve.dedupe;
                    target = config.build.target;
                },
            },
        ],
        resolve: { alias: aliases() },
    });
    const output = path.join(root, 'dist', mode);
    const files = await collectFiles(output);
    const source = (await Promise.all(files
        .filter((file) => file.endsWith('.js'))
        .map((file) => readFile(file, 'utf8')))).join('\n');
    return {
        files: files.map((file) => path.relative(output, file).replaceAll(path.sep, '/')),
        dedupe,
        output,
        source,
        target,
        report: report!,
    };
}

function buildReports() {
    const queued: PixifactBuildReport[] = [];
    const waiting: Array<(report: PixifactBuildReport) => void> = [];
    return {
        push(report: PixifactBuildReport) {
            const resolve = waiting.shift();
            if (resolve) resolve(report);
            else queued.push(report);
        },
        next() {
            const report = queued.shift();
            if (report) return Promise.resolve(report);
            return new Promise<PixifactBuildReport>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Timed out waiting for Vite watch rebuild.')), 10_000);
                waiting.push((value) => {
                    clearTimeout(timeout);
                    resolve(value);
                });
            });
        },
    };
}

async function waitForFile(filePath: string) {
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline) {
        try {
            return await readFile(filePath, 'utf8');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            await new Promise((resolve) => setTimeout(resolve, 10));
        }
    }
    throw new Error(`Timed out waiting for ${filePath}.`);
}

async function collectFiles(root: string): Promise<string[]> {
    const files: string[] = [];
    for (const entry of await readdir(root, { withFileTypes: true })) {
        const absolute = path.join(root, entry.name);
        if (entry.isDirectory()) files.push(...await collectFiles(absolute));
        else files.push(absolute);
    }
    return files;
}

afterEach(async () => {
    delete process.env.VITE_PLATFORM;
    for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('unified Vite platform build', () => {
    it('lets Vite load mode env without Bun preloading the base file', async () => {
        const root = await createProject();
        await writeFile(path.join(root, '.env'), 'VITE_PLATFORM=web\n');
        await writeFile(path.join(root, '.env.game1'), 'VITE_PLATFORM=wechat\nVITE_APP_ID=game1-app\n');
        await writeFile(path.join(root, 'check-env.ts'), [
            "import { loadEnv } from 'vite';",
            "console.log(JSON.stringify({ preloaded: process.env.VITE_PLATFORM ?? null, env: loadEnv('game1', process.cwd(), 'VITE_') }));",
            '',
        ].join('\n'));
        const env = { ...process.env };
        delete env.VITE_PLATFORM;
        delete env.VITE_APP_ID;

        const { stdout } = await execFileAsync('bun', ['run', 'check-env.ts'], { cwd: root, env });

        expect(JSON.parse(stdout)).toMatchObject({
            preloaded: null,
            env: { VITE_PLATFORM: 'wechat', VITE_APP_ID: 'game1-app' },
        });
    });

    it('loads arbitrary Vite modes and preserves process env precedence', async () => {
        const root = await createProject();
        await writeFile(path.join(root, '.env.wechat.local'), 'VITE_APP_ID=local-app-id\n');

        expect(loadPixifactEnv(root, 'wechat')).toMatchObject({
            platform: 'wechat',
            env: { VITE_APP_ID: 'local-app-id' },
        });

        process.env.VITE_PLATFORM = 'web';
        expect(loadPixifactEnv(root, 'wechat').platform).toBe('web');

        delete process.env.VITE_PLATFORM;
        await writeFile(path.join(root, '.env.missing'), 'VITE_APP_ID=unused\n');
        await writeFile(path.join(root, '.env.invalid'), 'VITE_PLATFORM=ios\n');
        await writeFile(path.join(root, '.env.web-app-id'), 'VITE_PLATFORM=web\nVITE_APP_ID=ignored\n');
        expect(() => loadPixifactEnv(root, 'missing')).toThrow('VITE_PLATFORM must be web, wechat, or douyin.');
        expect(() => loadPixifactEnv(root, 'invalid')).toThrow('VITE_PLATFORM must be web, wechat, or douyin.');
        expect(loadPixifactEnv(root, 'web-app-id')).toMatchObject({
            platform: 'web',
            env: { VITE_APP_ID: 'ignored' },
        });
    });

    it('builds Web, WeChat, and Douyin from one main entry with isolated bundles', async () => {
        const root = await createProject();
        const web = await buildMode(root, 'web');
        const wechat = await buildMode(root, 'wechat');
        const douyin = await buildMode(root, 'douyin');

        expect(web.files).toContain('index.html');
        expect(web.files).toContain('resources/local/config.json');
        expect(web.files).not.toContain('resources/remote/config.json');
        expect(web.source).toContain('pixifact-mode');
        expect(web.source).toContain('https://cdn.example.com/game/config.json');
        expect(web.source).not.toContain('WeChatMiniGame');
        expect(web.source).not.toContain('DouyinMiniGame');
        expect(web.source).not.toContain('pixifact-douyin-image');
        expect(web.dedupe).toContain('pixi.js');

        expect(wechat.files.filter((file) => !file.includes('/') && file.endsWith('.js'))).toEqual(['game.js']);
        expect(wechat.files).toContain('subpackages/local/config.json');
        expect(wechat.files).toContain('subpackages/local/fonts/demo.fnt');
        expect(wechat.files).toContain('subpackages/local/fonts/page.png');
        expect(wechat.files).toContain('subpackages/local/music.mp3');
        expect(wechat.files).toContain('subpackages/local/game.js');
        expect(wechat.files).not.toContain('subpackages/remote/config.json');
        expect(wechat.files).not.toContain('index.html');
        expect(wechat.source).toContain('WeChatMiniGame');
        expect(wechat.source).not.toContain('DouyinMiniGame');
        expect(wechat.source).not.toContain('pixifact-douyin-image');
        expect(wechat.dedupe).toContain('pixi.js');
        expect(JSON.parse(await readFile(path.join(wechat.output, 'project.config.json'), 'utf8')).appid)
            .toBe('wx-app-id');
        expect(wechat.report.subpackages.local).toBeGreaterThan(0);
        expect(wechat.report.totalPackageBytes).toBe(
            wechat.report.mainPackageBytes + Object.values(wechat.report.subpackages)
                .reduce((total, bytes) => total + bytes, 0),
        );

        expect(douyin.files.filter((file) => !file.includes('/') && file.endsWith('.js'))).toEqual(['game.js']);
        expect(douyin.files).not.toContain('index.html');
        expect(douyin.source).toContain('DouyinMiniGame');
        expect(douyin.source).not.toContain('WeChatMiniGame');
        expect(douyin.source).toContain('pixifact-douyin-image');
        expect(douyin.dedupe).toContain('pixi.js');
        expect(douyin.source).toMatch(/src:\s*["'`]assets\//);
        expect(douyin.source).not.toMatch(/src:\s*["'`]\/assets\//);
        expect(douyin.target).toBe('es2018');
        expect(JSON.parse(await readFile(path.join(douyin.output, 'project.config.json'), 'utf8')).appid)
            .toBe('tt-app-id');
    }, 30_000);

    it('keeps safe user Vite options while enforcing Mini Game output invariants', async () => {
        const root = await createProject();
        let dedupe: string[] = [];
        let report: PixifactBuildReport | undefined;
        await build({
            root,
            mode: 'wechat',
            configFile: false,
            logLevel: 'silent',
            plugins: [
                pixifact({ projectRoot: root }),
                pixifactBuildReporter('wechat', (value) => {
                    report = value;
                }),
                {
                    name: 'capture-resolve-dedupe',
                    configResolved(config) {
                        dedupe = config.resolve.dedupe;
                    },
                },
            ],
            resolve: { alias: aliases(), dedupe: ['user-runtime', 'pixi.js'] },
            build: {
                minify: false,
                outDir: 'custom-output',
                sourcemap: true,
            },
        });

        expect(report?.outputDirectory).toBe(path.join(root, 'custom-output'));
        expect(dedupe).toEqual(expect.arrayContaining(['user-runtime', 'pixi.js']));
        expect(dedupe.filter((dependency) => dependency === 'pixi.js')).toHaveLength(1);
        const files = (await collectFiles(path.join(root, 'custom-output')))
            .map((file) => path.relative(path.join(root, 'custom-output'), file).replaceAll(path.sep, '/'));
        expect(files).toContain('game.js');
        expect(files).toContain('game.js.map');
        expect(files).not.toContain('index.html');
        expect(files.filter((file) => !file.includes('/') && file.endsWith('.js'))).toEqual(['game.js']);
    }, 30_000);

    it('rebuilds tracked project config, Scene, script, resource, and native config changes', async () => {
        const root = await createProject();
        const reports = buildReports();
        const watcher = await build({
            root,
            mode: 'wechat',
            configFile: false,
            logLevel: 'silent',
            plugins: [
                pixifact({ projectRoot: root }),
                pixifactBuildReporter('wechat', reports.push),
            ],
            resolve: { alias: aliases() },
            build: { watch: {} },
        }) as Rollup.RollupWatcher;
        const initialBuildEnded = new Promise<void>((resolve, reject) => {
            watcher.on('event', (event) => {
                if (event.code === 'END') resolve();
                if (event.code === 'ERROR') reject(event.error);
            });
        });

        try {
            await reports.next();
            await initialBuildEnded;
            const rebuild = async (label: string, update: () => Promise<void>) => {
                const rebuildEnded = new Promise<void>((resolve, reject) => {
                    watcher.on('event', (event) => {
                        if (event.code === 'END') resolve();
                        if (event.code === 'ERROR') reject(event.error);
                    });
                });
                await update();
                let report: PixifactBuildReport;
                try {
                    [report] = await Promise.all([reports.next(), rebuildEnded]);
                } catch (error) {
                    throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`);
                }
                await new Promise((resolve) => setTimeout(resolve, 100));
                return report;
            };

            let report = await rebuild('resource', () => writeFile(
                path.join(root, 'resources/local/config.json'),
                '{"delivery":"updated"}\n',
            ));
            await expect(waitForFile(
                path.join(report.outputDirectory, 'subpackages/local/config.json'),
            )).resolves.toContain('"delivery":"updated"');

            const generatedScene = path.join(root, '.pixifact/generated/src/scenes/Main.scene.generated.ts');
            const beforeSceneChange = await readFile(generatedScene, 'utf8');
            report = await rebuild('scene', () => writeFile(path.join(root, 'src/scenes/Main.scene'), [
                '<Scene name="Main">',
                '  <Graphics id="background" shape="rect" width="100" height="100" fill="#ffffff" />',
                '</Scene>',
                '',
            ].join('\n')));
            expect(await readFile(generatedScene, 'utf8')).not.toBe(beforeSceneChange);

            report = await rebuild('script', () => writeFile(path.join(root, 'src/scenes/Main.ts'), [
                "import { Group } from 'pixifact/runtime';",
                "import { scene } from 'pixifact/scene';",
                '@scene()',
                'export class Main extends Group { readonly revision = 2; }',
                '',
            ].join('\n')));
            expect(report.platform).toBe('wechat');

            report = await rebuild('native', () => writeFile(
                path.join(root, 'platforms/wechat/project.config.json'),
                '{"setting":{"urlCheck":false}}\n',
            ));
            await expect(readFile(
                path.join(report.outputDirectory, 'project.config.json'),
                'utf8',
            )).resolves.toContain('"urlCheck": false');

            await mkdir(path.join(root, 'resources/extra'), { recursive: true });
            await writeFile(path.join(root, 'resources/extra/new.json'), '{"pack":"extra"}\n');
            report = await rebuild('project', async () => {
                const project = JSON.parse(await readFile(path.join(root, 'pixifact.project.json'), 'utf8'));
                project.resourcePacks.push('extra');
                await writeFile(
                    path.join(root, 'pixifact.project.json'),
                    `${JSON.stringify(project, null, 2)}\n`,
                );
            });
            const gameJson = JSON.parse(await readFile(path.join(report.outputDirectory, 'game.json'), 'utf8'));
            expect(gameJson.subpackages).toContainEqual({ name: 'extra', root: 'subpackages/extra' });
            await expect(readFile(
                path.join(report.outputDirectory, 'subpackages/extra/new.json'),
                'utf8',
            )).resolves.toContain('"pack":"extra"');

            const files = (await collectFiles(report.outputDirectory))
                .map((file) => path.relative(report.outputDirectory, file).replaceAll(path.sep, '/'));
            expect(files).toContain('subpackages/local/config.json');
            expect(files).toContain('subpackages/extra/new.json');
        } finally {
            await watcher.close();
        }
    }, 30_000);

    it('rejects output directories that could erase project inputs', async () => {
        const root = await createProject();

        await expect(build({
            root,
            mode: 'web',
            configFile: false,
            logLevel: 'silent',
            plugins: [pixifact({ projectRoot: root })],
            resolve: { alias: aliases() },
            build: { outDir: 'platforms/generated' },
        })).rejects.toThrow('Vite build.outDir must not contain project inputs.');
        await expect(readFile(path.join(root, 'platforms/wechat/game.json'), 'utf8'))
            .resolves.toBe('{}\n');
    });
});
