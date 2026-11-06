import { access, readFile, readdir, stat } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import MagicString from 'magic-string';
import {
    loadEnv,
    parseAst,
    Visitor,
    type ConfigEnv,
    type ESTree,
    type Plugin,
    type ResolvedConfig,
    type UserConfig,
} from 'vite';
import {
    parsePixifactProjectConfig,
    pixifactProjectConfigFileName,
    type PixifactProjectConfig,
} from '../project';
import { compileScenes, generatedSceneAssetsFileName } from '../compiler/compileScenes';

export type PixifactPlatform = 'web' | 'wechat' | 'douyin';

export interface PixifactPluginOptions {
    /** Code subpackage names mapped to project-relative TypeScript/JavaScript entries. */
    codePackages?: Record<string, string>;
    projectRoot?: string | URL;
}

export interface PixifactBuildReport {
    mainPackageBytes: number;
    outputDirectory: string;
    platform: PixifactPlatform;
    subpackages: Record<string, number>;
    totalPackageBytes: number;
}

interface PlatformDescriptor {
    ecmascriptTarget: 'es2018' | 'es2020';
    mainPackageLimit(hasSubpackages: boolean): number | undefined;
    module: string;
    subpackageProperty: 'subpackages' | 'subPackages';
    userAgent: string;
}

interface PreparedAsset {
    absolutePath: string;
    logicalPath: string;
    pack?: string;
    relativePath?: string;
    remoteBaseUrl?: string;
}

interface PixifactPluginState {
    codePackages: Map<string, string>;
    config?: PixifactProjectConfig;
    env?: Record<string, string>;
    mode?: string;
    platform?: PixifactPlatform;
    prepared?: Promise<PreparedAsset[]>;
    projectRoot?: string;
    resolved?: ResolvedConfig;
}

const totalPackageLimit = 20 * 1024 * 1024;
const mainPackageLimit = 4 * 1024 * 1024;
const descriptors: Record<Exclude<PixifactPlatform, 'web'>, PlatformDescriptor> = {
    wechat: {
        ecmascriptTarget: 'es2020',
        mainPackageLimit: () => mainPackageLimit,
        module: '@pixifact/platform-wechat',
        subpackageProperty: 'subpackages',
        userAgent: 'WeChatMiniGame',
    },
    douyin: {
        ecmascriptTarget: 'es2018',
        mainPackageLimit: (hasSubpackages) => hasSubpackages ? mainPackageLimit : undefined,
        module: '@pixifact/platform-douyin',
        subpackageProperty: 'subPackages',
        userAgent: 'DouyinMiniGame',
    },
};

const virtualPlatformId = '\0pixifact:platform';
const virtualAssetsId = '\0pixifact:assets';
const virtualScenesId = '\0pixifact:scenes';
const virtualCodeLoaderId = '\0pixifact:code-loader';

export function pixifact(options: PixifactPluginOptions = {}): Plugin[] {
    const state: PixifactPluginState = { codePackages: new Map() };
    return [
        scenePlugin(state, options),
        platformPlugin(state),
        assetsPlugin(state),
        resourcePlugin(state),
        codePackagesPlugin(state),
        miniGamePlugin(state),
    ];
}

function scenePlugin(state: PixifactPluginState, options: PixifactPluginOptions): Plugin {
    return {
        name: 'pixifact-scenes',
        async config(config, env) {
            await configureState(state, options, config, env);
            const projectRoot = required(state.projectRoot);
            const platform = required(state.platform);
            const output = platform === 'web'
                ? {}
                : miniGameBuildConfig(projectRoot, platform, config, state.codePackages.size > 0);
            return {
                ...output,
                root: projectRoot,
                resolve: {
                    dedupe: config.resolve?.dedupe?.includes('pixi.js') ? [] : ['pixi.js'],
                },
                build: {
                    outDir: path.resolve(projectRoot, config.build?.outDir ?? `dist/${platform}`),
                    ...output.build,
                },
            };
        },
        configResolved(config) {
            state.resolved = config;
            state.projectRoot = config.root;
            assertSafeOutputDirectory(config.root, config.build.outDir);
        },
        async buildStart() {
            state.prepared = prepareProject(state);
            const assets = await state.prepared;
            for (const file of watchedFiles(state, assets)) {
                this.addWatchFile(file);
            }
        },
        resolveId(id) {
            return id === 'pixifact:scenes' ? virtualScenesId : undefined;
        },
        load(id) {
            if (id !== virtualScenesId) return undefined;
            return `import ${JSON.stringify(viteFileImport(path.join(
                required(state.projectRoot),
                '.pixifact/generated/scenes.generated.ts',
            )))};`;
        },
    };
}

function platformPlugin(state: PixifactPluginState): Plugin {
    return {
        name: 'pixifact-platform',
        resolveId(id) {
            return id === 'pixifact:platform' ? virtualPlatformId : undefined;
        },
        load(id) {
            if (id !== virtualPlatformId) return undefined;
            const platform = required(state.platform);
            const module = platform === 'web' ? 'pixifact/platform/web' : descriptors[platform].module;
            return `export { createApplication } from ${JSON.stringify(module)};`;
        },
    };
}

function assetsPlugin(state: PixifactPluginState): Plugin {
    return {
        name: 'pixifact-assets',
        resolveId(id) {
            return id === 'pixifact:assets' ? virtualAssetsId : undefined;
        },
        async load(id) {
            if (id !== virtualAssetsId) return undefined;
            const assets = await required(state.prepared);
            return assetsModuleSource(state, assets);
        },
    };
}

function resourcePlugin(state: PixifactPluginState): Plugin {
    return {
        name: 'pixifact-resources',
        async buildStart() {
            if (required(state.resolved).command !== 'build') return;
            const platform = required(state.platform);
            for (const asset of await required(state.prepared)) {
                if (!asset.pack || asset.remoteBaseUrl) continue;
                const fileName = platform === 'web'
                    ? asset.logicalPath
                    : path.posix.join('subpackages', asset.pack, required(asset.relativePath));
                this.emitFile({
                    type: 'asset',
                    fileName,
                    source: await readFile(asset.absolutePath),
                });
            }
            if (platform !== 'web') {
                for (const pack of localPacks(required(state.config))) {
                    if (state.codePackages.has(pack)) continue;
                    this.emitFile({
                        type: 'asset',
                        fileName: path.posix.join('subpackages', pack, 'game.js'),
                        source: '// Pixifact asset-only subpackage.\n',
                    });
                }
            }
        },
    };
}

function codePackagesPlugin(state: PixifactPluginState): Plugin {
    return {
        name: 'pixifact-code-packages',
        apply: 'build',
        enforce: 'post',
        async buildStart(input) {
            if (state.platform === 'web' || state.codePackages.size === 0) return;
            const entries = typeof input.input === 'string' ? [input.input]
                : Array.isArray(input.input) ? input.input : Object.values(input.input);
            const entryIds = await Promise.all(entries.map(async entry => (await this.resolve(entry))?.id));
            for (const [name, id] of state.codePackages) {
                if (entryIds.includes(id)) {
                    this.error(`代码分包 ${name} 不能使用应用主入口 ${id}。`);
                }
                this.emitFile({ type: 'chunk', id, fileName: `subpackages/${name}/game.js`, preserveSignature: 'strict' });
            }
        },
        resolveId(id) {
            return id === virtualCodeLoaderId ? id : undefined;
        },
        load(id) {
            if (id !== virtualCodeLoaderId) return;
            const api = state.platform === 'wechat' ? 'wx' : 'tt';
            return [
                "import { createMiniGameSubpackageLoader } from 'pixifact/internal/minigame';",
                `export const loadCodePackage = createMiniGameSubpackageLoader(() => ${api}, ${JSON.stringify(state.platform)});`,
            ].join('\n');
        },
        async transform(code, id) {
            if (state.platform === 'web' || state.codePackages.size === 0) return;
            // Native require() loads chunks. Vite's browser preload/error helper
            // would otherwise access Event/window and mask module exceptions.
            if (id === '\0vite/preload-helper.js') {
                return 'export function __vitePreload(load) { return load(); }';
            }
            if (!code.includes('import')) return;
            const source = parseAst(code);
            const dynamicImports: { node: ESTree.ImportExpression; specifier: string }[] = [];
            const identifiers = new Set<string>();
            new Visitor({
                Identifier(node) { identifiers.add(node.name); },
                ImportExpression(node) {
                    const argument = node.source;
                    const specifier = argument.type === 'TemplateLiteral' && argument.expressions.length === 0
                        ? argument.quasis[0]!.value.cooked : argument.type === 'Literal' ? argument.value : undefined;
                    if (typeof specifier === 'string') dynamicImports.push({ node, specifier });
                },
            }).visit(source);
            const specifiers = new Set(dynamicImports.map(({ specifier }) => specifier));
            const packagesById = new Map([...state.codePackages].map(([name, entry]) => [entry, name]));
            const imports = new Map<string, string>();
            for (const specifier of specifiers) {
                const resolved = await this.resolve(specifier, id);
                const name = resolved && packagesById.get(resolved.id);
                if (name) imports.set(specifier, name);
            }
            if (imports.size === 0) return;
            let loader = '__pixifactLoadCodePackage';
            while (identifiers.has(loader)) loader += '_';
            const transformed = new MagicString(code);
            for (const { node, specifier } of dynamicImports) {
                const name = imports.get(specifier);
                if (name) {
                    transformed.appendLeft(node.start, `${loader}(${JSON.stringify(name)}).then(() => `);
                    transformed.appendRight(node.end, ')');
                }
            }
            transformed.appendLeft(source.body[0]!.start,
                `import { loadCodePackage as ${loader} } from ${JSON.stringify(virtualCodeLoaderId)};\n`);
            return { code: transformed.toString(), map: transformed.generateMap({ source: id, includeContent: true, hires: true }) };
        },
        buildEnd(error) {
            if (error || state.platform === 'web' || state.codePackages.size === 0) return;
            const packagesById = new Map([...state.codePackages].map(([name, id]) => [id, name]));
            for (const root of this.getModuleIds()) {
                if (!this.getModuleInfo(root)?.isEntry) continue;
                const owner = packagesById.get(root);
                const visited = new Set<string>();
                const visit = (id: string) => {
                    if (visited.has(id)) return;
                    visited.add(id);
                    for (const dependency of this.getModuleInfo(id)?.importedIds ?? []) {
                        const name = packagesById.get(dependency);
                        if (name && name !== owner) {
                            this.error(`不能静态引用代码分包 ${name}（${id}）；请从主包使用 import() 加载分包入口。`);
                        }
                        visit(dependency);
                    }
                };
                visit(root);
            }
        },
        generateBundle(_options, bundle) {
            if (state.platform === 'web' || state.codePackages.size === 0) return;
            for (const chunk of Object.values(bundle)) {
                if (chunk.type !== 'chunk') continue;
                const owner = chunk.fileName.match(/^subpackages\/([^/]+)\//)?.[1];
                for (const dependency of [...chunk.imports, ...chunk.dynamicImports]) {
                    const name = dependency.match(/^subpackages\/([^/]+)\//)?.[1];
                    if (name && owner && name !== owner) {
                        this.error(`代码分包 ${owner} 不能引用分包 ${name}；请由主包发起分包加载。`);
                    }
                }
            }
        },
    };
}

function miniGamePlugin(state: PixifactPluginState): Plugin {
    return {
        name: 'pixifact-minigame',
        async buildStart() {
            const platform = required(state.platform);
            if (platform === 'web') return;
            await required(state.prepared);
            const projectRoot = required(state.projectRoot);
            const configDir = path.join(projectRoot, 'platforms', platform);
            const descriptor = descriptors[platform];
            const gameJson = JSON.parse(await readFile(path.join(configDir, 'game.json'), 'utf8')) as Record<string, unknown>;
            const projectConfig = JSON.parse(
                await readFile(path.join(configDir, 'project.config.json'), 'utf8'),
            ) as Record<string, unknown>;
            if (gameJson[descriptor.subpackageProperty] !== undefined) {
                throw new Error(
                    `platforms/${platform}/game.json 的 ${descriptor.subpackageProperty} 由 Pixifact 根据资源包和代码分包生成，不能在源模板中重复声明。`,
                );
            }
            gameJson[descriptor.subpackageProperty] = [...new Set([
                ...localPacks(required(state.config)), ...state.codePackages.keys(),
            ])].map((name) => ({
                name,
                root: `subpackages/${name}`,
            }));
            projectConfig.appid = required(state.env).VITE_APP_ID;
            this.emitFile({
                type: 'asset',
                fileName: 'game.json',
                source: `${JSON.stringify(gameJson, null, 2)}\n`,
            });
            this.emitFile({
                type: 'asset',
                fileName: 'project.config.json',
                source: `${JSON.stringify(projectConfig, null, 2)}\n`,
            });
        },
        generateBundle(_options, bundle) {
            const platform = required(state.platform);
            if (platform === 'web') return;
            enforcePackageLimits(createBuildReport(platform, required(state.resolved).build.outDir, bundle));
        },
    };
}

export function pixifactBuildReporter(
    platform: PixifactPlatform,
    onReport: (report: PixifactBuildReport) => void,
): Plugin {
    let outputDirectory = '';
    return {
        name: 'pixifact-build-reporter',
        configResolved(config) {
            outputDirectory = config.build.outDir;
        },
        generateBundle(_options, bundle) {
            onReport(createBuildReport(platform, outputDirectory, bundle));
        },
    };
}

export function loadPixifactEnv(projectRoot: string, mode: string) {
    const env = loadEnv(mode, projectRoot, 'VITE_');
    const platform = env.VITE_PLATFORM;
    if (platform !== 'web' && platform !== 'wechat' && platform !== 'douyin') {
        throw new Error('VITE_PLATFORM must be web, wechat, or douyin.');
    }
    if (platform !== 'web' && !env.VITE_APP_ID) {
        throw new Error(`VITE_APP_ID is required for the ${platform} platform.`);
    }
    return { env, platform: platform as PixifactPlatform };
}

async function configureState(
    state: PixifactPluginState,
    options: PixifactPluginOptions,
    config: UserConfig,
    env: ConfigEnv,
) {
    const configuredRoot = options.projectRoot ?? config.root;
    const projectRoot = realpathSync(path.resolve(projectRootPath(configuredRoot)));
    const loaded = loadPixifactEnv(projectRoot, env.mode);
    state.projectRoot = projectRoot;
    state.mode = env.mode;
    state.env = loaded.env;
    state.platform = loaded.platform;
    state.config = parsePixifactProjectConfig(JSON.parse(
        await readFile(path.join(projectRoot, pixifactProjectConfigFileName), 'utf8'),
    ));
    state.codePackages = new Map();
    for (const [name, entry] of Object.entries(options.codePackages ?? {})) {
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name)) {
            throw new Error(`代码分包名称 ${name} 只能包含字母、数字、连字符和下划线，并以字母或数字开头。`);
        }
        const absolute = realpathSync(path.resolve(projectRoot, entry)).replaceAll(path.sep, '/');
        const relative = path.relative(projectRoot, absolute);
        if (path.isAbsolute(entry) || relative.startsWith(`..${path.sep}`) || relative === '..') {
            throw new Error(`代码分包 ${name} 的入口必须位于项目内并使用项目相对路径。`);
        }
        if ([...state.codePackages.values()].includes(absolute)) {
            throw new Error(`代码分包 ${name} 重复声明入口 ${entry}。`);
        }
        state.codePackages.set(name, absolute);
    }
}

function miniGameBuildConfig(
    projectRoot: string,
    platform: Exclude<PixifactPlatform, 'web'>,
    config: UserConfig,
    hasCodePackages: boolean,
): UserConfig {
    const descriptor = descriptors[platform];
    return {
        appType: 'custom',
        experimental: {
            ...config.experimental,
            renderBuiltUrl: (filename) => filename,
        },
        publicDir: false,
        build: {
            assetsInlineLimit: 0,
            modulePreload: false,
            rolldownOptions: {
                ...config.build?.rolldownOptions,
                ...(hasCodePackages ? {
                    preserveEntrySignatures: 'strict' as const,
                } : {}),
                input: config.build?.rolldownOptions?.input ?? path.join(projectRoot, 'src/main.ts'),
                output: {
                    ...(Array.isArray(config.build?.rolldownOptions?.output)
                        ? {}
                        : config.build?.rolldownOptions?.output),
                    banner: [
                        'var Intl=globalThis.Intl||{};',
                        `var navigator=globalThis.navigator||(globalThis.navigator={gpu:null,userAgent:${JSON.stringify(descriptor.userAgent)}});`,
                    ].join('\n'),
                    entryFileNames: 'game.js',
                    format: hasCodePackages ? 'cjs' : 'iife',
                    ...(hasCodePackages ? {
                        chunkFileNames: 'chunks/[name]-[hash].js',
                        codeSplitting: true,
                        dynamicImportInCjs: false,
                    } : {}),
                },
            },
            target: descriptor.ecmascriptTarget,
        },
    };
}

async function prepareProject(state: PixifactPluginState) {
    const projectRoot = required(state.projectRoot);
    state.config = parsePixifactProjectConfig(JSON.parse(
        await readFile(path.join(projectRoot, pixifactProjectConfigFileName), 'utf8'),
    ));
    await compileScenes({ projectRoot });
    const config = required(state.config);
    const sceneAssets = JSON.parse(await readFile(path.join(
        projectRoot,
        '.pixifact/generated',
        generatedSceneAssetsFileName,
    ), 'utf8')) as string[];
    const assets = new Map<string, PreparedAsset>();
    for (const pack of config.resourcePacks ?? []) {
        const root = path.join(projectRoot, 'resources', pack);
        for (const absolutePath of await collectFiles(root)) {
            const relativePath = projectPath(root, absolutePath);
            const logicalPath = path.posix.join('resources', pack, relativePath);
            assets.set(logicalPath, {
                absolutePath,
                logicalPath,
                pack,
                relativePath,
                remoteBaseUrl: config.remoteResourcePacks?.[pack],
            });
        }
    }
    for (const logicalPath of sceneAssets) {
        if (!assets.has(logicalPath)) {
            assets.set(logicalPath, {
                absolutePath: path.resolve(projectRoot, logicalPath),
                logicalPath,
            });
        }
    }
    return [...assets.values()];
}

function assetsModuleSource(state: PixifactPluginState, assets: PreparedAsset[]) {
    const platform = required(state.platform);
    const resolved = required(state.resolved);
    const imports: string[] = [];
    const sourceByPath = new Map<string, string>();
    for (const asset of assets) {
        if (asset.remoteBaseUrl) {
            sourceByPath.set(asset.logicalPath, JSON.stringify(
                `${asset.remoteBaseUrl}/${required(asset.relativePath)}`,
            ));
        } else if (asset.pack) {
            if (platform === 'web' && resolved.command === 'serve') {
                sourceByPath.set(asset.logicalPath, JSON.stringify(viteFileImport(asset.absolutePath)));
            } else {
                const output = platform === 'web'
                    ? asset.logicalPath
                    : path.posix.join('subpackages', asset.pack, required(asset.relativePath));
                sourceByPath.set(asset.logicalPath, platform === 'web'
                    ? `import.meta.env.BASE_URL + ${JSON.stringify(output)}`
                    : JSON.stringify(output));
            }
        } else {
            const identifier = `__pixifactAsset${imports.length + 1}`;
            imports.push(`import ${identifier} from ${JSON.stringify(viteFileImport(asset.absolutePath, '?url'))};`);
            sourceByPath.set(asset.logicalPath, identifier);
        }
    }
    const bundles = (required(state.config).resourcePacks ?? []).map((name) => ({
        name,
        assets: assets.filter((asset) => asset.pack === name),
    }));
    const main = assets.filter((asset) => !asset.pack);
    if (main.length > 0) bundles.unshift({ name: '__pixifact_main__', assets: main });
    const bundleSource = bundles.map((bundle) => `{
        name: ${JSON.stringify(bundle.name)},
        assets: [${bundle.assets.map((asset) => `{
            alias: ${JSON.stringify(asset.logicalPath)},
            src: ${required(sourceByPath.get(asset.logicalPath))},
        }`).join(',')}],
    }`).join(',');
    return `${imports.join('\n')}\nconst manifest = { bundles: [${bundleSource}] };\nexport default manifest;\n`;
}

function watchedFiles(state: PixifactPluginState, assets: PreparedAsset[]) {
    const projectRoot = required(state.projectRoot);
    const config = required(state.config);
    const files = [
        path.join(projectRoot, pixifactProjectConfigFileName),
        ...Object.values(config.scenes).flatMap((scene) => [
            path.join(projectRoot, scene),
            path.join(projectRoot, scene.replace(/\.scene$/, '.ts')),
        ]),
        ...assets.map((asset) => asset.absolutePath),
    ];
    const platform = required(state.platform);
    if (platform !== 'web') {
        files.push(
            path.join(projectRoot, 'platforms', platform, 'game.json'),
            path.join(projectRoot, 'platforms', platform, 'project.config.json'),
        );
    }
    return files;
}

function createBuildReport(
    platform: PixifactPlatform,
    outputDirectory: string,
    bundle: Record<string, { code?: string; fileName: string; source?: string | Uint8Array }>,
): PixifactBuildReport {
    const subpackages: Record<string, number> = {};
    let mainPackageBytes = 0;
    let totalPackageBytes = 0;
    for (const output of Object.values(bundle)) {
        if (output.fileName.endsWith('.map') || output.fileName === 'project.config.json') continue;
        const bytes = output.code === undefined
            ? typeof output.source === 'string' ? Buffer.byteLength(output.source) : output.source?.byteLength ?? 0
            : Buffer.byteLength(output.code);
        const match = output.fileName.match(/^subpackages\/([^/]+)\//);
        if (match) {
            subpackages[match[1]] = (subpackages[match[1]] ?? 0) + bytes;
        } else {
            mainPackageBytes += bytes;
        }
        totalPackageBytes += bytes;
    }
    return { mainPackageBytes, outputDirectory, platform, subpackages, totalPackageBytes };
}

function enforcePackageLimits(report: PixifactBuildReport) {
    if (report.platform === 'web') return;
    const descriptor = descriptors[report.platform];
    const limit = descriptor.mainPackageLimit(Object.keys(report.subpackages).length > 0);
    if (limit !== undefined && report.mainPackageBytes > limit) {
        throw new Error(`${report.platform} main package exceeds ${limit} bytes.`);
    }
    if (report.totalPackageBytes > totalPackageLimit) {
        throw new Error(`${report.platform} total package exceeds ${totalPackageLimit} bytes.`);
    }
}

function localPacks(config: PixifactProjectConfig) {
    return (config.resourcePacks ?? []).filter((name) => !config.remoteResourcePacks?.[name]);
}

function projectRootPath(projectRoot: string | URL | undefined) {
    if (typeof projectRoot === 'string') return projectRoot;
    if (projectRoot) return fileURLToPath(projectRoot);
    return process.cwd();
}

function assertSafeOutputDirectory(projectRoot: string, outputDirectory: string) {
    const root = path.resolve(projectRoot);
    const output = path.resolve(root, outputDirectory);
    if (output === root || !output.startsWith(`${root}${path.sep}`)) {
        throw new Error('Vite build.outDir must be a directory inside the project root.');
    }
    const relative = projectPath(root, output);
    const inputRoots = ['.pixifact', 'platforms', 'resources', 'src'];
    if (inputRoots.some((input) => relative === input || relative.startsWith(`${input}/`))) {
        throw new Error('Vite build.outDir must not contain project inputs.');
    }
}

async function collectFiles(root: string): Promise<string[]> {
    if (!await isDirectory(root)) return [];
    const files: string[] = [];
    for (const entry of await readdir(root, { withFileTypes: true })) {
        const absolute = path.join(root, entry.name);
        if (entry.isDirectory()) files.push(...await collectFiles(absolute));
        else if (entry.isFile()) files.push(absolute);
    }
    return files;
}

async function isDirectory(filePath: string) {
    try {
        return (await stat(filePath)).isDirectory();
    } catch {
        return false;
    }
}

export async function fileExists(filePath: string) {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
}

function viteFileImport(filePath: string, suffix = '') {
    return `/@fs/${filePath.replaceAll(path.sep, '/')}${suffix}`;
}

function projectPath(root: string, filePath: string) {
    return path.relative(root, filePath).replaceAll(path.sep, '/');
}

function required<T>(value: T | undefined): T {
    if (value === undefined) throw new Error('Pixifact Vite plugin state is not ready.');
    return value;
}
