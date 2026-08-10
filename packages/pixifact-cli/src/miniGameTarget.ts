import { createHash } from 'node:crypto';
import { watch as watchFiles, type FSWatcher } from 'node:fs';
import { access, cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build, type BuildOptions, type Plugin } from 'esbuild';
import {
    parsePixifactProjectConfig,
    pixifactProjectConfigFileName,
    type PixifactMiniGameTargetConfig,
    type PixifactProjectConfig,
} from 'pixifact';
import {
    compilerSceneNodeLocator,
    parseSceneTemplate,
    type SceneTemplateNode,
} from 'pixifact/compiler';
import { compileScenes, generatedSceneAssetsFileName } from 'pixifact/compiler-node';

const defaultTotalPackageLimit = 20 * 1024 * 1024;
const defaultMainPackageLimit = 4 * 1024 * 1024;

export interface MiniGameTargetDescriptor {
    configTargetName: 'wechat' | 'douyin';
    displayName: '微信' | '抖音';
    ecmascriptTarget: 'es2018' | 'es2020';
    mainPackageLimit(hasSubpackages: boolean): number | undefined;
    platformModule: string;
    targetName: 'wechat' | 'douyin';
    userAgent: string;
    subpackageProperty: 'subpackages' | 'subPackages';
    totalPackageLimit: number;
}

export interface MiniGameTargetDiagnostic {
    asset?: string;
    message: string;
    node?: string;
    scene?: string;
}

export interface MiniGameBuildReport {
    mainPackageBytes: number;
    outputDirectory: string;
    subpackages: Record<string, number>;
    totalPackageBytes: number;
}

export type MiniGameDevEvent = {
    type: 'built';
    report: MiniGameBuildReport;
} | {
    type: 'error';
    error: string;
    diagnostics?: MiniGameTargetDiagnostic[];
};

export interface MiniGameDevSession {
    close(): void;
    initialReport: MiniGameBuildReport;
}

export class MiniGameTargetError extends Error {
    constructor(
        message: string,
        readonly diagnostics: MiniGameTargetDiagnostic[],
    ) {
        super(message);
        this.name = 'MiniGameTargetError';
    }
}

interface MiniGameTargetContext {
    config: PixifactProjectConfig;
    projectRoot: string;
    target: PixifactMiniGameTargetConfig;
}

interface SceneAssetLocation {
    pack?: string;
    src: string;
}

interface SceneAssetReference {
    asset: string;
    node: string;
    scene: string;
}

const supportedTextureExtensions = new Set(['.jpeg', '.jpg', '.png', '.webp']);

export const wechatTargetDescriptor: MiniGameTargetDescriptor = {
    configTargetName: 'wechat',
    displayName: '微信',
    ecmascriptTarget: 'es2020',
    mainPackageLimit: () => defaultMainPackageLimit,
    platformModule: 'pixifact/platform/wechat',
    targetName: 'wechat',
    userAgent: 'WeChatMiniGame',
    subpackageProperty: 'subpackages',
    totalPackageLimit: defaultTotalPackageLimit,
};

export const douyinTargetDescriptor: MiniGameTargetDescriptor = {
    configTargetName: 'douyin',
    displayName: '抖音',
    ecmascriptTarget: 'es2018',
    mainPackageLimit: (hasSubpackages) => hasSubpackages ? defaultMainPackageLimit : undefined,
    platformModule: 'pixifact/platform/douyin',
    targetName: 'douyin',
    userAgent: 'DouyinMiniGame',
    subpackageProperty: 'subPackages',
    totalPackageLimit: defaultTotalPackageLimit,
};

export async function validateMiniGameTarget(
    projectRootInput: string,
    descriptor: MiniGameTargetDescriptor,
) {
    const context = await readTargetContext(projectRootInput, descriptor);
    const diagnostics = await collectTargetDiagnostics(context, descriptor);
    return { context, diagnostics };
}

export async function buildMiniGameTarget(
    projectRootInput: string,
    mode: 'development' | 'production',
    descriptor: MiniGameTargetDescriptor,
): Promise<MiniGameBuildReport> {
    const { context, diagnostics } = await validateMiniGameTarget(projectRootInput, descriptor);
    if (diagnostics.length > 0) {
        throw new MiniGameTargetError(`${descriptor.displayName} target validation failed.`, diagnostics);
    }
    await compileScenes({ projectRoot: context.projectRoot });
    const generatedDir = path.join(context.projectRoot, '.pixifact', 'generated');
    const assets = JSON.parse(
        await readFile(path.join(generatedDir, generatedSceneAssetsFileName), 'utf8'),
    ) as string[];
    const outputDirectory = path.resolve(context.projectRoot, context.target.outDir);
    assertSafeOutputDirectory(context, descriptor, outputDirectory);
    await rm(outputDirectory, { force: true, recursive: true });
    await mkdir(outputDirectory, { recursive: true });

    const manifest = await emitTargetAssets(context, assets, outputDirectory);
    await copyTargetConfiguration(context, outputDirectory);
    await build(targetBuildOptions(context, descriptor, outputDirectory, manifest, mode));
    const report = await createBuildReport(context, descriptor, outputDirectory);
    const sizeDiagnostics: MiniGameTargetDiagnostic[] = [];
    const mainPackageLimit = descriptor.mainPackageLimit(hasSubpackages(context));
    if (mainPackageLimit !== undefined && report.mainPackageBytes > mainPackageLimit) {
        sizeDiagnostics.push({
            message: `${descriptor.displayName}主包为 ${report.mainPackageBytes} bytes，超过 ${mainPackageLimit / 1024 / 1024} MiB 限制。`,
        });
    }
    if (report.totalPackageBytes > descriptor.totalPackageLimit) {
        sizeDiagnostics.push({
            message: `${descriptor.displayName}代码包总计 ${report.totalPackageBytes} bytes，超过 ${descriptor.totalPackageLimit / 1024 / 1024} MiB 限制。`,
        });
    }
    if (sizeDiagnostics.length > 0) {
        throw new MiniGameTargetError(`${descriptor.displayName} package size validation failed.`, sizeDiagnostics);
    }
    return report;
}

export async function devMiniGameTarget(
    projectRootInput: string,
    descriptor: MiniGameTargetDescriptor,
    onEvent: (event: MiniGameDevEvent) => void = () => undefined,
): Promise<MiniGameDevSession> {
    const initialReport = await buildMiniGameTarget(projectRootInput, 'development', descriptor);
    const { context } = await validateMiniGameTarget(projectRootInput, descriptor);
    const ignoredPaths = new Set([
        '.git',
        '.pixifact',
        'node_modules',
        context.target.outDir,
    ]);
    let watcher: FSWatcher;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let building = false;
    let queued = false;
    let closed = false;

    const rebuild = async () => {
        if (closed) {
            return;
        }
        if (building) {
            queued = true;
            return;
        }
        building = true;
        try {
            const report = await buildMiniGameTarget(context.projectRoot, 'development', descriptor);
            ignoredPaths.add(projectPath(context.projectRoot, report.outputDirectory));
            onEvent({ type: 'built', report });
        } catch (error) {
            onEvent(targetDevErrorEvent(error));
        } finally {
            building = false;
            if (queued) {
                queued = false;
                void rebuild();
            }
        }
    };
    watcher = watchFiles(context.projectRoot, { recursive: true }, (_eventType, filename) => {
        const relativePath = filename?.toString().replaceAll(path.sep, '/');
        if (!relativePath || [...ignoredPaths].some((ignored) =>
            relativePath === ignored || relativePath.startsWith(`${ignored}/`)
        )) {
            return;
        }
        clearTimeout(debounce);
        debounce = setTimeout(() => void rebuild(), 80);
    });

    return {
        close() {
            if (closed) {
                return;
            }
            closed = true;
            clearTimeout(debounce);
            watcher.close();
        },
        initialReport,
    };
}

function targetDevErrorEvent(error: unknown): MiniGameDevEvent {
    return error instanceof MiniGameTargetError
        ? { type: 'error', error: error.message, diagnostics: error.diagnostics }
        : { type: 'error', error: error instanceof Error ? error.message : String(error) };
}

async function readTargetContext(
    projectRootInput: string,
    descriptor: MiniGameTargetDescriptor,
): Promise<MiniGameTargetContext> {
    const projectRoot = path.resolve(projectRootInput);
    const config = parsePixifactProjectConfig(JSON.parse(
        await readFile(path.join(projectRoot, pixifactProjectConfigFileName), 'utf8'),
    ));
    const target = config.targets?.[descriptor.configTargetName];
    if (!target) {
        throw new Error(`pixifact.project.json does not declare targets.${descriptor.targetName}.`);
    }
    return { config, projectRoot, target };
}

function assertSafeOutputDirectory(
    context: MiniGameTargetContext,
    descriptor: MiniGameTargetDescriptor,
    outputDirectory: string,
) {
    if (outputDirectory === context.projectRoot || !outputDirectory.startsWith(`${context.projectRoot}${path.sep}`)) {
        throw new Error(`targets.${descriptor.targetName}.outDir must be a directory inside projectRoot.`);
    }
    const inputs = [
        '.pixifact',
        context.target.entry,
        context.target.configDir,
        ...Object.values(context.config.scenes),
        ...Object.values(context.config.resourcePacks ?? {}).map((pack) => pack.root),
    ];
    const outDir = context.target.outDir.replaceAll(path.sep, '/').replace(/\/+$/, '');
    const containedInput = inputs.find((input) => input === outDir || input.startsWith(`${outDir}/`));
    if (containedInput) {
        throw new Error(`targets.${descriptor.targetName}.outDir must not contain project input "${containedInput}".`);
    }
}

async function collectTargetDiagnostics(
    context: MiniGameTargetContext,
    descriptor: MiniGameTargetDescriptor,
) {
    const diagnostics: MiniGameTargetDiagnostic[] = [];
    const sceneAssets: SceneAssetReference[] = [];
    await requireFile(context, context.target.entry, diagnostics, `${descriptor.displayName}入口不存在。`);
    await requireFile(
        context,
        path.posix.join(context.target.configDir, 'game.json'),
        diagnostics,
        `${descriptor.displayName} game.json 不存在。`,
    );
    await requireFile(
        context,
        path.posix.join(context.target.configDir, 'project.config.json'),
        diagnostics,
        `${descriptor.displayName} project.config.json 不存在。`,
    );
    for (const [name, pack] of Object.entries(context.config.resourcePacks ?? {})) {
        if (!context.target.resourcePacks[name]) {
            diagnostics.push({ message: `${descriptor.displayName} target 未声明资源包 ${name} 的 delivery。` });
        }
        const root = path.resolve(context.projectRoot, pack.root);
        if (!await isDirectory(root)) {
            diagnostics.push({ asset: pack.root, message: `资源包 ${name} 的根目录不存在。` });
            continue;
        }
        for (const file of await collectFiles(root)) {
            if (path.extname(file).toLowerCase() === '.svg') {
                diagnostics.push({
                    asset: projectPath(context.projectRoot, file),
                    message: `${descriptor.displayName}小游戏目标不支持 SVG 资源。`,
                });
            }
        }
    }
    for (const [name, delivery] of Object.entries(context.target.resourcePacks)) {
        if (delivery.delivery === 'remote' && !isHttpsUrl(delivery.baseUrl)) {
            diagnostics.push({ message: `远程资源包 ${name} 的 baseUrl 必须使用 HTTPS。` });
        }
    }
    for (const scene of await collectFiles(path.join(context.projectRoot, 'src'), '.scene')) {
        const scenePath = projectPath(context.projectRoot, scene);
        const template = parseSceneTemplate(await readFile(scene, 'utf8'));
        collectSceneDiagnostics(template.children, scenePath, '', diagnostics, sceneAssets, descriptor);
    }
    for (const reference of sceneAssets) {
        if (!await exists(path.join(context.projectRoot, reference.asset))) {
            diagnostics.push({
                ...reference,
                message: `${descriptor.displayName}小游戏 Scene 纹理文件不存在。`,
            });
        }
    }
    await validateTargetSubpackages(context, descriptor, diagnostics);
    return diagnostics;
}

function isHttpsUrl(value: string) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && url.hostname !== '';
    } catch {
        return false;
    }
}

function collectSceneDiagnostics(
    nodes: SceneTemplateNode[],
    scene: string,
    parentPath: string,
    diagnostics: MiniGameTargetDiagnostic[],
    assets: SceneAssetReference[],
    descriptor: MiniGameTargetDescriptor,
) {
    for (const [index, node] of nodes.entries()) {
        const nodePath = parentPath ? `${parentPath}/${index}` : String(index);
        if (node.kind === 'slotOutlet') {
            continue;
        }
        if (node.kind === 'sceneInstance') {
            for (const [slotName, children] of Object.entries(node.slots)) {
                collectSceneDiagnostics(children, scene, `${nodePath}/slot:${slotName}`, diagnostics, assets, descriptor);
            }
            continue;
        }
        const locator = compilerSceneNodeLocator(node, nodePath);
        if (node.type === 'HTMLText' || node.type === 'DOMContainer') {
            diagnostics.push({
                message: `${descriptor.displayName}小游戏目标不支持 ${node.type}。`,
                node: locator,
                scene,
            });
        }
        if (typeof node.props.texture === 'string') {
            const texture = node.props.texture;
            if (!isProjectAssetPath(texture)) {
                diagnostics.push({
                    asset: texture,
                    message: `${descriptor.displayName}小游戏 Scene 纹理必须使用项目根目录内的相对路径。`,
                    node: locator,
                    scene,
                });
            } else if (!supportedTextureExtensions.has(path.extname(texture).toLowerCase())) {
                const extension = path.extname(texture).toLowerCase();
                diagnostics.push({
                    asset: texture,
                    message: `${descriptor.displayName}小游戏 Scene 纹理不支持 ${extension || '无扩展名'} 格式。`,
                    node: locator,
                    scene,
                });
            } else {
                assets.push({ asset: texture, node: locator, scene });
            }
        }
        collectSceneDiagnostics(node.children, scene, nodePath, diagnostics, assets, descriptor);
    }
}

function isProjectAssetPath(value: string) {
    return value.trim() !== ''
        && !value.startsWith('/')
        && !value.startsWith('./')
        && !value.includes('\\')
        && !value.split('/').includes('..')
        && !/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value);
}

async function validateTargetSubpackages(
    context: MiniGameTargetContext,
    descriptor: MiniGameTargetDescriptor,
    diagnostics: MiniGameTargetDiagnostic[],
) {
    const gameJsonPath = path.join(context.projectRoot, context.target.configDir, 'game.json');
    if (!await exists(gameJsonPath)) {
        return;
    }
    const gameJson = await readFile(gameJsonPath, 'utf8').then((content) => JSON.parse(content) as Record<string, unknown>);
    const declarations = gameJson[descriptor.subpackageProperty] as Array<{ name?: string; root?: string }> | undefined;
    for (const [name, delivery] of Object.entries(context.target.resourcePacks)) {
        if (delivery.delivery !== 'subpackage') {
            continue;
        }
        const declaration = declarations?.find((subpackage) => subpackage.name === name);
        if (!declaration || declaration.root !== delivery.root) {
            diagnostics.push({
                message: `game.json 必须声明${descriptor.targetName === 'wechat' ? '' : descriptor.displayName}分包 ${name}，root 为 ${delivery.root}。`,
            });
        }
    }
}

function hasSubpackages(context: MiniGameTargetContext) {
    return Object.values(context.target.resourcePacks).some((delivery) => delivery.delivery === 'subpackage');
}

async function emitTargetAssets(
    context: MiniGameTargetContext,
    assets: string[],
    outputDirectory: string,
) {
    const manifest: Record<string, SceneAssetLocation> = {};
    for (const [name, pack] of Object.entries(context.config.resourcePacks ?? {})) {
        const delivery = context.target.resourcePacks[name];
        if (delivery.delivery !== 'subpackage') {
            continue;
        }
        const source = path.join(context.projectRoot, pack.root);
        const destination = path.join(outputDirectory, delivery.root);
        await cp(source, destination, { recursive: true });
        const entry = path.join(destination, 'game.js');
        if (!await exists(entry)) {
            await writeFile(entry, '// Pixifact asset-only subpackage.\n');
        }
    }
    for (const asset of assets) {
        const source = path.resolve(context.projectRoot, asset);
        const pack = resourcePackFor(context, asset);
        if (pack) {
            const sourceRoot = context.config.resourcePacks![pack.name].root;
            const relative = path.posix.relative(sourceRoot, asset);
            const delivery = pack.delivery;
            manifest[asset] = delivery.delivery === 'subpackage'
                ? { pack: pack.name, src: path.posix.join(delivery.root, relative) }
                : { src: `${delivery.baseUrl}/${relative}` };
            continue;
        }
        const content = await readFile(source);
        const extension = path.extname(asset);
        const basename = path.basename(asset, extension);
        const hash = createHash('sha256').update(content).digest('hex').slice(0, 8);
        const output = path.posix.join('assets', `${basename}-${hash}${extension}`);
        await mkdir(path.dirname(path.join(outputDirectory, output)), { recursive: true });
        await writeFile(path.join(outputDirectory, output), content);
        manifest[asset] = { src: output };
    }
    return manifest;
}

function resourcePackFor(context: MiniGameTargetContext, asset: string) {
    const matches = Object.entries(context.config.resourcePacks ?? {}).filter(([, pack]) =>
        asset === pack.root || asset.startsWith(`${pack.root}/`)
    );
    if (matches.length > 1) {
        throw new Error(`Scene asset "${asset}" matches multiple resource packs.`);
    }
    const match = matches[0];
    return match
        ? { name: match[0], delivery: context.target.resourcePacks[match[0]] }
        : undefined;
}

async function copyTargetConfiguration(context: MiniGameTargetContext, outputDirectory: string) {
    for (const file of ['game.json', 'project.config.json']) {
        await cp(
            path.join(context.projectRoot, context.target.configDir, file),
            path.join(outputDirectory, file),
        );
    }
}

function targetBuildOptions(
    context: MiniGameTargetContext,
    descriptor: MiniGameTargetDescriptor,
    outputDirectory: string,
    manifest: Record<string, SceneAssetLocation>,
    mode: 'development' | 'production',
): BuildOptions {
    return {
        absWorkingDir: context.projectRoot,
        assetNames: 'assets/[name]-[hash]',
        banner: {
            js: [
                'var Intl=globalThis.Intl||{};',
                `var navigator=globalThis.navigator||(globalThis.navigator={gpu:null,userAgent:${JSON.stringify(descriptor.userAgent)}});`,
            ].join('\n'),
        },
        bundle: true,
        define: {
            'process.env.NODE_ENV': JSON.stringify(mode),
        },
        entryPoints: [path.resolve(context.projectRoot, context.target.entry)],
        format: 'iife',
        legalComments: 'none',
        loader: {
            '.jpeg': 'file',
            '.jpg': 'file',
            '.mp3': 'file',
            '.ogg': 'file',
            '.png': 'file',
            '.wav': 'file',
            '.webp': 'file',
        },
        logLevel: 'silent',
        minify: mode === 'production',
        outfile: path.join(outputDirectory, 'game.js'),
        platform: 'browser',
        plugins: [targetScenesPlugin(context, descriptor, manifest)],
        sourcemap: mode === 'development',
        target: descriptor.ecmascriptTarget,
    };
}

function targetScenesPlugin(
    context: MiniGameTargetContext,
    descriptor: MiniGameTargetDescriptor,
    manifest: Record<string, SceneAssetLocation>,
): Plugin {
    return {
        name: `pixifact-${descriptor.targetName}-scenes`,
        setup(buildContext) {
            buildContext.onResolve({ filter: /^pixifact:scenes$/ }, () => ({
                namespace: `pixifact-${descriptor.targetName}`,
                path: 'scenes',
            }));
            buildContext.onLoad({ filter: /^scenes$/, namespace: `pixifact-${descriptor.targetName}` }, () => ({
                contents: [
                    "import { configureSceneAssets } from 'pixifact/scene';",
                    `import { load${descriptor.targetName === 'wechat' ? 'Wechat' : 'Douyin'}Subpackage } from '${descriptor.platformModule}';`,
                    `import ${JSON.stringify(path.join(context.projectRoot, '.pixifact', 'generated', 'scenes.generated.ts'))};`,
                    `configureSceneAssets(${JSON.stringify(manifest)}, { loadPack: load${descriptor.targetName === 'wechat' ? 'Wechat' : 'Douyin'}Subpackage });`,
                ].join('\n'),
                loader: 'ts',
                resolveDir: context.projectRoot,
            }));
        },
    };
}

async function createBuildReport(
    context: MiniGameTargetContext,
    descriptor: MiniGameTargetDescriptor,
    outputDirectory: string,
): Promise<MiniGameBuildReport> {
    const subpackageRoots = Object.fromEntries(
        Object.entries(context.target.resourcePacks)
            .filter(([, delivery]) => delivery.delivery === 'subpackage')
            .map(([name, delivery]) => [name, delivery.delivery === 'subpackage' ? delivery.root : '']),
    );
    const subpackages = Object.fromEntries(Object.keys(subpackageRoots).map((name) => [name, 0]));
    let mainPackageBytes = 0;
    let totalPackageBytes = 0;
    const files = await collectFiles(outputDirectory);
    for (const file of files) {
        if (file.endsWith('.map') || file.endsWith('project.config.json')) {
            continue;
        }
        const bytes = (await stat(file)).size;
        const relative = projectPath(outputDirectory, file);
        const subpackage = Object.entries(subpackageRoots).find(([, root]) =>
            relative === root || relative.startsWith(`${root}/`)
        );
        if (subpackage) {
            subpackages[subpackage[0]] += bytes;
        } else {
            mainPackageBytes += bytes;
        }
        totalPackageBytes += bytes;
    }
    return { mainPackageBytes, outputDirectory, subpackages, totalPackageBytes };
}

async function requireFile(
    context: MiniGameTargetContext,
    relativePath: string,
    diagnostics: MiniGameTargetDiagnostic[],
    message: string,
) {
    if (!await exists(path.join(context.projectRoot, relativePath))) {
        diagnostics.push({ asset: relativePath, message });
    }
}

async function collectFiles(root: string, suffix?: string) {
    const files: string[] = [];
    if (!await isDirectory(root)) {
        return files;
    }
    for (const entry of await readdir(root, { withFileTypes: true })) {
        const absolute = path.join(root, entry.name);
        if (entry.isDirectory()) {
            files.push(...await collectFiles(absolute, suffix));
        } else if (entry.isFile() && (!suffix || entry.name.endsWith(suffix))) {
            files.push(absolute);
        }
    }
    return files;
}

async function exists(filePath: string) {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function isDirectory(filePath: string) {
    try {
        return (await stat(filePath)).isDirectory();
    } catch {
        return false;
    }
}

function projectPath(root: string, filePath: string) {
    return path.relative(root, filePath).replaceAll(path.sep, '/');
}
