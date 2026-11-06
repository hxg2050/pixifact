import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { SourceMap } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
import { createContext, runInContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { build, type Rolldown } from 'vite';
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
    await writeFile(path.join(root, 'tsconfig.json'), JSON.stringify({
        compilerOptions: { experimentalDecorators: true, useDefineForClassFields: true },
    }));
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

async function buildMode(root: string, mode: 'web' | 'wechat' | 'douyin', codePackages?: Record<string, string>) {
    let dedupe: string[] = [];
    let target: string | string[] | false = false;
    let report: PixifactBuildReport | undefined;
    await build({
        root,
        mode,
        configFile: false,
        logLevel: 'silent',
        plugins: [
            pixifact({ projectRoot: root, codePackages }),
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

async function createCodeProject() {
    const root = await createProject();
    await writeFile(path.join(root, 'src/shared.ts'), 'export const shared = { count: 0 };\n');
    await writeFile(path.join(root, 'src/game-detail.ts'), "export const detail = 'CODE_PACKAGE_ONLY_GAME';\n");
    await writeFile(path.join(root, 'src/game.ts'), [
        "import { shared } from './shared';",
        "import { detail } from './game-detail';",
        'globalThis.evaluations = (globalThis.evaluations ?? 0) + 1;',
        'export { shared };',
        'export let count = 0;',
        'export function step() { count++; shared.count++; }',
        'export default detail;',
    ].join('\n'));
    await writeFile(path.join(root, 'src/extra.ts'), [
        "import { shared } from './shared';",
        'export { shared };',
        "export const extra = 'CODE_PACKAGE_ONLY_EXTRA';",
    ].join('\n'));
    await writeFile(path.join(root, 'src/failing.ts'), "throw new Error('module initialization failed'); export {};\n");
    await writeFile(path.join(root, 'src/main.ts'), [
        "import { shared } from './shared';",
        'globalThis.shared = shared;',
        "globalThis.loadGame = (__pixifactLoadCodePackage = 'user-owned') => { globalThis.loaderName = __pixifactLoadCodePackage; return import('./game'); };",
        'globalThis.loadExtra = () => import(`./extra`);',
        "globalThis.loadFailure = () => import('./failing');",
        "globalThis.importText = \"import('./game')\";",
    ].join('\n'));
    return root;
}

// Execute the emitted CommonJS modules with native-style subpackage loading.
// A package's game.js executes before success, as on the Mini Game hosts.
function codeRuntime(output: string, platform: 'wechat' | 'douyin') {
    const pending: Array<{ name: string; success(): void; fail(error: { errMsg: string }): void }> = [];
    const loaded = new Set<string>();
    const cache = new Map<string, { exports: object }>();
    const context = createContext({
        console,
        [platform === 'wechat' ? 'wx' : 'tt']: {
            loadSubpackage(request: typeof pending[number]) { pending.push(request); },
        },
    });
    function requireFile(file: string): object {
        const relative = path.relative(output, file).replaceAll(path.sep, '/');
        const pack = relative.match(/^subpackages\/([^/]+)\//)?.[1];
        if (pack && !loaded.has(pack)) throw new Error(`Required ${relative} before its subpackage loaded.`);
        const cached = cache.get(file);
        if (cached) return cached.exports;
        const module = { exports: {} };
        cache.set(file, module);
        const factory = runInContext(`(function(require, module, exports) {\n${readFileSync(file, 'utf8')}\n})`, context);
        factory((specifier: string) => requireFile(path.resolve(path.dirname(file), specifier)), module, module.exports);
        return module.exports;
    }
    requireFile(path.join(output, 'game.js'));
    return {
        context,
        pending,
        complete(index: number) {
            const request = pending[index];
            loaded.add(request.name);
            requireFile(path.join(output, 'subpackages', request.name, 'game.js'));
            request.success();
        },
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
    it.each(['wechat', 'douyin'] as const)('loads %s code packages lazily with shared exports and retryable downloads', async (platform) => {
        const root = await createCodeProject();
        const result = await buildMode(root, platform, { local: 'src/game.ts', extra: 'src/extra.ts' });
        expect(result.files).toContain('subpackages/local/game.js');
        expect(result.files).toContain('subpackages/extra/game.js');
        const nativeConfig = JSON.parse(await readFile(path.join(result.output, 'game.json'), 'utf8'));
        expect(nativeConfig[platform === 'wechat' ? 'subpackages' : 'subPackages']).toEqual([
            { name: 'local', root: 'subpackages/local' },
            { name: 'extra', root: 'subpackages/extra' },
        ]);
        const mainCode = (await Promise.all(result.files.filter(file => file.endsWith('.js') && !file.startsWith('subpackages/'))
            .map(file => readFile(path.join(result.output, file), 'utf8')))).join('\n');
        expect(mainCode).not.toContain('CODE_PACKAGE_ONLY_GAME');
        expect(mainCode).not.toContain('CODE_PACKAGE_ONLY_EXTRA');
        expect(result.report.subpackages.extra).toBeGreaterThan(0);
        expect(result.report.subpackages.local).toBeGreaterThan(0);

        const runtime = codeRuntime(result.output, platform);
        expect(runtime.pending).toHaveLength(0);
        expect(runtime.context.evaluations).toBeUndefined();
        expect(runtime.context.importText).toBe("import('./game')");
        await expect(runtime.context.loadFailure()).rejects.toThrow('module initialization failed');
        const failures = Promise.allSettled([runtime.context.loadGame(), runtime.context.loadGame()]);
        await vi.waitFor(() => expect(runtime.pending).toHaveLength(1));
        runtime.pending[0].fail({ errMsg: 'download interrupted' });
        const rejected = await failures;
        expect(rejected.every(value => value.status === 'rejected' && /download interrupted/.test(value.reason.message))).toBe(true);
        expect(runtime.context.evaluations).toBeUndefined();

        const imports = [runtime.context.loadGame(), runtime.context.loadGame()];
        await vi.waitFor(() => expect(runtime.pending).toHaveLength(2));
        runtime.complete(1);
        const [game, again] = await Promise.all(imports);
        expect(game).toBe(again);
        expect(game.default).toBe('CODE_PACKAGE_ONLY_GAME');
        expect(game.shared).toBe(runtime.context.shared);
        game.step();
        expect(game.count).toBe(1);
        expect(runtime.context.shared.count).toBe(1);
        expect(runtime.context.evaluations).toBe(1);
        expect(runtime.context.loaderName).toBe('user-owned');
        expect(await runtime.context.loadGame()).toBe(game);
        expect(runtime.pending).toHaveLength(2);

        const extraImport = runtime.context.loadExtra();
        await vi.waitFor(() => expect(runtime.pending).toHaveLength(3));
        runtime.complete(2);
        expect((await extraImport).shared).toBe(game.shared);
    }, 30_000);

    it.each(['wechat', 'douyin'] as const)('builds %s code packages alongside Scene registration and Application', async (platform) => {
        const root = await createCodeProject();
        const entry = path.join(root, 'src/main.ts');
        await writeFile(entry, [
            "import 'pixifact:scenes';",
            "import { createApplication } from 'pixifact:platform';",
            'globalThis.createApp = createApplication;',
            await readFile(entry, 'utf8'),
        ].join('\n'));
        const result = await buildMode(root, platform, { local: 'src/game.ts', extra: 'src/extra.ts' });
        const runtime = codeRuntime(result.output, platform);
        expect(typeof runtime.context.createApp).toBe('function');
        expect(runtime.pending).toHaveLength(0);
        const game = runtime.context.loadGame();
        await vi.waitFor(() => expect(runtime.pending).toHaveLength(1));
        runtime.complete(0);
        expect((await game).default).toBe('CODE_PACKAGE_ONLY_GAME');
    }, 30_000);

    it('keeps Web code imports native while accepting the same package configuration', async () => {
        const root = await createCodeProject();
        const result = await buildMode(root, 'web', { local: 'src/game.ts', extra: 'src/extra.ts' });
        expect(result.files).toContain('index.html');
        expect(result.files.some(file => file.startsWith('subpackages/'))).toBe(false);
        expect(result.source).not.toContain('loadSubpackage');
        expect(result.source).not.toContain('WeChat');
        expect(result.source).toContain('CODE_PACKAGE_ONLY_GAME');
        expect(result.files.filter(file => file.endsWith('.js')).length).toBeGreaterThan(1);
    });

    it('rejects eager and cross-package references to code package entries', async () => {
        const root = await createCodeProject();
        await writeFile(path.join(root, 'src/main.ts'), "import value from './game'; console.info(value);\n");
        await expect(buildMode(root, 'wechat', { local: 'src/game.ts' })).rejects.toThrow('静态引用代码分包');
        await writeFile(path.join(root, 'src/main.ts'), "globalThis.loadGame = () => import('./game');\n");
        await writeFile(path.join(root, 'src/game.ts'), "import { extra } from './extra'; export default extra;\n");
        await expect(buildMode(root, 'wechat', { local: 'src/game.ts', extra: 'src/extra.ts' })).rejects.toThrow('静态引用代码分包');
        await writeFile(path.join(root, 'src/game.ts'), "export const loadExtra = () => import('./extra');\n");
        await expect(buildMode(root, 'wechat', { local: 'src/game.ts', extra: 'src/extra.ts' })).rejects.toThrow('不能引用分包');
    });

    it('validates code package names, entries, and the main entry boundary', async () => {
        const root = await createCodeProject();
        await expect(buildMode(root, 'wechat', { '../outside': 'src/game.ts' })).rejects.toThrow('代码分包名称');
        await expect(buildMode(root, 'wechat', { local: 'src/game.ts', other: 'src/game.ts' })).rejects.toThrow('重复声明入口');
        await expect(buildMode(root, 'wechat', { local: 'src/missing.ts' })).rejects.toThrow('ENOENT');
        await expect(buildMode(root, 'wechat', { local: 'src/main.ts' })).rejects.toThrow('主入口');
        await rm(path.join(root, 'src/main.ts'));
        await symlink(path.join(root, 'src/game.ts'), path.join(root, 'src/main.ts'));
        await expect(buildMode(root, 'wechat', { local: 'src/game.ts' })).rejects.toThrow('主入口');
        const otherRoot = await createCodeProject();
        await expect(buildMode(root, 'wechat', { local: path.relative(root, path.join(otherRoot, 'src/game.ts')) }))
            .rejects.toThrow('入口必须位于项目内');
    });

    it('rebuilds code package imports and private dependencies with sourcemaps', async () => {
        const root = await createCodeProject();
        const reports = buildReports();
        const watcher = await build({
            root,
            mode: 'wechat',
            configFile: false,
            logLevel: 'silent',
            plugins: [
                pixifact({ projectRoot: root, codePackages: { local: 'src/game.ts', extra: 'src/extra.ts' } }),
                pixifactBuildReporter('wechat', reports.push),
            ],
            resolve: { alias: aliases() },
            build: { watch: {}, sourcemap: true, minify: false },
        }) as Rolldown.RolldownWatcher;
        const ended = () => new Promise<void>((resolve, reject) => {
            const listener = (event: Rolldown.RolldownWatcherEvent) => {
                if (event.code === 'END' || event.code === 'ERROR') {
                    watcher.off('event', listener);
                    if (event.code === 'ERROR') reject(event.error);
                    else resolve();
                }
            };
            watcher.on('event', listener);
        });
        try {
            await Promise.all([reports.next(), ended()]);
            const next = Promise.all([reports.next(), ended()]);
            await writeFile(path.join(root, 'src/game-detail.ts'), "export const detail = 'UPDATED_PRIVATE_GAME_CODE';\n");
            const [report] = await next;
            const runtime = codeRuntime(report.outputDirectory, 'wechat');
            const loaded = runtime.context.loadGame();
            await vi.waitFor(() => expect(runtime.pending).toHaveLength(1));
            runtime.complete(0);
            expect((await loaded).default).toBe('UPDATED_PRIVATE_GAME_CODE');
            const sourceMap = JSON.parse(await readFile(path.join(report.outputDirectory, 'subpackages/local/game.js.map'), 'utf8'));
            expect(sourceMap.sources.some((source: string) => source.endsWith('src/game.ts'))).toBe(true);
            const mainCode = await readFile(path.join(report.outputDirectory, 'game.js'), 'utf8');
            const mainMap = new SourceMap(JSON.parse(await readFile(path.join(report.outputDirectory, 'game.js.map'), 'utf8')));
            const original = (await readFile(path.join(root, 'src/main.ts'), 'utf8')).split('\n');
            for (const marker of ['globalThis.loadGame', 'globalThis.importText']) {
                const offset = mainCode.indexOf(marker);
                expect(offset).toBeGreaterThan(-1);
                const prefix = mainCode.slice(0, offset).split('\n');
                const entry = mainMap.findEntry(prefix.length - 1, prefix.at(-1)!.length);
                expect(entry.originalSource).toMatch(/src\/main\.ts$/);
                expect(entry.originalLine).toBe(original.findIndex((line) => line.includes(marker)));
                expect(entry.originalColumn).toBe(0);
            }
            const packageFiles = (await collectFiles(path.join(report.outputDirectory, 'subpackages/local')))
                .filter(file => !file.endsWith('.map'));
            const bytes = (await Promise.all(packageFiles.map(file => readFile(file)))).reduce((sum, file) => sum + file.byteLength, 0);
            expect(report.subpackages.local).toBe(bytes);
        } finally {
            await watcher.close();
        }
    }, 30_000);

    it('lets Vite load mode env without Bun preloading the base file', async () => {
        if (!process.versions.bun) return;
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

        const { stdout } = await execFileAsync(process.execPath, ['run', 'check-env.ts'], { cwd: root, env });

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
                rolldownOptions: {
                    output: {
                        intro: 'globalThis.userBuildMarker = true;',
                        entryFileNames: 'custom-user-entry.js',
                        format: 'es',
                    },
                },
            },
        });

        expect(report?.outputDirectory).toBe(path.join(root, 'custom-output'));
        expect(dedupe).toEqual(expect.arrayContaining(['user-runtime', 'pixi.js']));
        expect(dedupe.filter((dependency) => dependency === 'pixi.js')).toHaveLength(1);
        const files = (await collectFiles(path.join(root, 'custom-output')))
            .map((file) => path.relative(path.join(root, 'custom-output'), file).replaceAll(path.sep, '/'));
        expect(files).toContain('game.js');
        expect(files).toContain('game.js.map');
        expect(await readFile(path.join(root, 'custom-output/game.js'), 'utf8')).toContain('userBuildMarker');
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
        }) as Rolldown.RolldownWatcher;
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
