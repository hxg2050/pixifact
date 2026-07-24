import { createHash } from 'node:crypto';
import { watch as watchFiles, type FSWatcher } from 'node:fs';
import { access, cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build, type BuildOptions, type Plugin } from 'esbuild';
import {
    parsePixifactProjectConfig,
    pixifactProjectConfigFileName,
    type PixifactProjectConfig,
    type PixifactWechatTargetConfig,
} from 'pixifact';
import {
    compilerSceneNodeLocator,
    parseSceneTemplate,
    type SceneTemplateNode,
} from 'pixifact/compiler';
import { compileScenes, generatedSceneAssetsFileName } from 'pixifact/compiler-node';

const wechatMainPackageLimit = 4 * 1024 * 1024;
const wechatTotalPackageLimit = 20 * 1024 * 1024;
const supportedWechatTextureExtensions = new Set(['.jpeg', '.jpg', '.png', '.webp']);

export interface WechatTargetDiagnostic {
    asset?: string;
    message: string;
    node?: string;
    scene?: string;
}

export interface WechatBuildReport {
    mainPackageBytes: number;
    outputDirectory: string;
    subpackages: Record<string, number>;
    totalPackageBytes: number;
}

export type WechatDevEvent = {
    type: 'built';
    report: WechatBuildReport;
} | {
    type: 'error';
    error: string;
    diagnostics?: WechatTargetDiagnostic[];
};

export interface WechatDevSession {
    close(): void;
    initialReport: WechatBuildReport;
}

export class WechatTargetError extends Error {
    constructor(
        message: string,
        readonly diagnostics: WechatTargetDiagnostic[],
    ) {
        super(message);
        this.name = 'WechatTargetError';
    }
}

interface WechatTargetContext {
    config: PixifactProjectConfig;
    projectRoot: string;
    target: PixifactWechatTargetConfig;
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

export async function validateWechatTarget(projectRootInput: string) {
    const context = await readTargetContext(projectRootInput);
    const diagnostics = await collectWechatDiagnostics(context);
    return { context, diagnostics };
}

export async function buildWechatTarget(
    projectRootInput: string,
    mode: 'development' | 'production',
): Promise<WechatBuildReport> {
    const { context, diagnostics } = await validateWechatTarget(projectRootInput);
    if (diagnostics.length > 0) {
        throw new WechatTargetError('WeChat target validation failed.', diagnostics);
    }
    await compileScenes({ projectRoot: context.projectRoot });
    const generatedDir = path.join(context.projectRoot, '.pixifact', 'generated');
    const assets = JSON.parse(
        await readFile(path.join(generatedDir, generatedSceneAssetsFileName), 'utf8'),
    ) as string[];
    const outputDirectory = path.resolve(context.projectRoot, context.target.outDir);
    assertSafeOutputDirectory(context, outputDirectory);
    await rm(outputDirectory, { force: true, recursive: true });
    await mkdir(outputDirectory, { recursive: true });

    const manifest = await emitTargetAssets(context, assets, outputDirectory);
    await copyWechatConfiguration(context, outputDirectory);
    await build(wechatBuildOptions(context, outputDirectory, manifest, mode));
    const report = await createBuildReport(context, outputDirectory);
    const sizeDiagnostics: WechatTargetDiagnostic[] = [];
    if (report.mainPackageBytes > wechatMainPackageLimit) {
        sizeDiagnostics.push({ message: `微信主包为 ${report.mainPackageBytes} bytes，超过 4 MiB 限制。` });
    }
    if (report.totalPackageBytes > wechatTotalPackageLimit) {
        sizeDiagnostics.push({ message: `微信代码包总计 ${report.totalPackageBytes} bytes，超过 20 MiB 限制。` });
    }
    if (sizeDiagnostics.length > 0) {
        throw new WechatTargetError('WeChat package size validation failed.', sizeDiagnostics);
    }
    return report;
}

export async function devWechatTarget(
    projectRootInput: string,
    onEvent: (event: WechatDevEvent) => void = () => undefined,
): Promise<WechatDevSession> {
    const initialReport = await buildWechatTarget(projectRootInput, 'development');
    const { context } = await validateWechatTarget(projectRootInput);
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
            const report = await buildWechatTarget(context.projectRoot, 'development');
            ignoredPaths.add(projectPath(context.projectRoot, report.outputDirectory));
            onEvent({ type: 'built', report });
        } catch (error) {
            onEvent(wechatDevErrorEvent(error));
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

function wechatDevErrorEvent(error: unknown): WechatDevEvent {
    return error instanceof WechatTargetError
        ? { type: 'error', error: error.message, diagnostics: error.diagnostics }
        : { type: 'error', error: error instanceof Error ? error.message : String(error) };
}

async function readTargetContext(projectRootInput: string): Promise<WechatTargetContext> {
    const projectRoot = path.resolve(projectRootInput);
    const config = parsePixifactProjectConfig(JSON.parse(
        await readFile(path.join(projectRoot, pixifactProjectConfigFileName), 'utf8'),
    ));
    const target = config.targets?.wechat;
    if (!target) {
        throw new Error('pixifact.project.json does not declare targets.wechat.');
    }
    return { config, projectRoot, target };
}

function assertSafeOutputDirectory(context: WechatTargetContext, outputDirectory: string) {
    if (outputDirectory === context.projectRoot || !outputDirectory.startsWith(`${context.projectRoot}${path.sep}`)) {
        throw new Error('targets.wechat.outDir must be a directory inside projectRoot.');
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
        throw new Error(`targets.wechat.outDir must not contain project input "${containedInput}".`);
    }
}

async function collectWechatDiagnostics(context: WechatTargetContext) {
    const diagnostics: WechatTargetDiagnostic[] = [];
    const sceneAssets: SceneAssetReference[] = [];
    await requireFile(context, context.target.entry, diagnostics, '微信入口不存在。');
    await requireFile(
        context,
        path.posix.join(context.target.configDir, 'game.json'),
        diagnostics,
        '微信 game.json 不存在。',
    );
    await requireFile(
        context,
        path.posix.join(context.target.configDir, 'project.config.json'),
        diagnostics,
        '微信 project.config.json 不存在。',
    );
    for (const [name, pack] of Object.entries(context.config.resourcePacks ?? {})) {
        if (!context.target.resourcePacks[name]) {
            diagnostics.push({ message: `微信 target 未声明资源包 ${name} 的 delivery。` });
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
                    message: '微信小游戏目标不支持 SVG 资源。',
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
        collectSceneDiagnostics(template.children, scenePath, '', diagnostics, sceneAssets);
    }
    for (const reference of sceneAssets) {
        if (!await exists(path.join(context.projectRoot, reference.asset))) {
            diagnostics.push({
                ...reference,
                message: '微信小游戏 Scene 纹理文件不存在。',
            });
        }
    }
    await validateWechatSubpackages(context, diagnostics);
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
    diagnostics: WechatTargetDiagnostic[],
    assets: SceneAssetReference[],
) {
    for (const [index, node] of nodes.entries()) {
        const nodePath = parentPath ? `${parentPath}/${index}` : String(index);
        if (node.kind === 'slotOutlet') {
            continue;
        }
        if (node.kind === 'sceneInstance') {
            for (const [slotName, children] of Object.entries(node.slots)) {
                collectSceneDiagnostics(children, scene, `${nodePath}/slot:${slotName}`, diagnostics, assets);
            }
            continue;
        }
        const locator = compilerSceneNodeLocator(node, nodePath);
        if (node.type === 'HTMLText' || node.type === 'DOMContainer') {
            diagnostics.push({
                message: `微信小游戏目标不支持 ${node.type}。`,
                node: locator,
                scene,
            });
        }
        if (typeof node.props.texture === 'string') {
            const texture = node.props.texture;
            if (!isProjectAssetPath(texture)) {
                diagnostics.push({
                    asset: texture,
                    message: '微信小游戏 Scene 纹理必须使用项目根目录内的相对路径。',
                    node: locator,
                    scene,
                });
            } else if (!supportedWechatTextureExtensions.has(path.extname(texture).toLowerCase())) {
                const extension = path.extname(texture).toLowerCase();
                diagnostics.push({
                    asset: texture,
                    message: `微信小游戏 Scene 纹理不支持 ${extension || '无扩展名'} 格式。`,
                    node: locator,
                    scene,
                });
            } else {
                assets.push({ asset: texture, node: locator, scene });
            }
        }
        collectSceneDiagnostics(node.children, scene, nodePath, diagnostics, assets);
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

async function validateWechatSubpackages(
    context: WechatTargetContext,
    diagnostics: WechatTargetDiagnostic[],
) {
    const gameJsonPath = path.join(context.projectRoot, context.target.configDir, 'game.json');
    if (!await exists(gameJsonPath)) {
        return;
    }
    const gameJson = JSON.parse(await readFile(gameJsonPath, 'utf8')) as {
        subpackages?: Array<{ name?: string; root?: string }>;
    };
    for (const [name, delivery] of Object.entries(context.target.resourcePacks)) {
        if (delivery.delivery !== 'subpackage') {
            continue;
        }
        const declaration = gameJson.subpackages?.find((subpackage) => subpackage.name === name);
        if (!declaration || declaration.root !== delivery.root) {
            diagnostics.push({
                message: `game.json 必须声明分包 ${name}，root 为 ${delivery.root}。`,
            });
        }
    }
}

async function emitTargetAssets(
    context: WechatTargetContext,
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

function resourcePackFor(context: WechatTargetContext, asset: string) {
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

async function copyWechatConfiguration(context: WechatTargetContext, outputDirectory: string) {
    for (const file of ['game.json', 'project.config.json']) {
        await cp(
            path.join(context.projectRoot, context.target.configDir, file),
            path.join(outputDirectory, file),
        );
    }
}

function wechatBuildOptions(
    context: WechatTargetContext,
    outputDirectory: string,
    manifest: Record<string, SceneAssetLocation>,
    mode: 'development' | 'production',
): BuildOptions {
    return {
        absWorkingDir: context.projectRoot,
        assetNames: 'assets/[name]-[hash]',
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
        plugins: [wechatScenesPlugin(context, manifest)],
        sourcemap: mode === 'development',
        target: 'es2020',
    };
}

function wechatScenesPlugin(
    context: WechatTargetContext,
    manifest: Record<string, SceneAssetLocation>,
): Plugin {
    return {
        name: 'pixifact-wechat-scenes',
        setup(buildContext) {
            buildContext.onResolve({ filter: /^pixifact:scenes$/ }, () => ({
                namespace: 'pixifact-wechat',
                path: 'scenes',
            }));
            buildContext.onLoad({ filter: /^scenes$/, namespace: 'pixifact-wechat' }, () => ({
                contents: [
                    "import { configureSceneAssets } from 'pixifact/scene';",
                    "import { loadWechatSubpackage } from 'pixifact/platform/wechat';",
                    `import ${JSON.stringify(path.join(context.projectRoot, '.pixifact', 'generated', 'scenes.generated.ts'))};`,
                    `configureSceneAssets(${JSON.stringify(manifest)}, { loadPack: loadWechatSubpackage });`,
                ].join('\n'),
                loader: 'ts',
                resolveDir: context.projectRoot,
            }));
        },
    };
}

async function createBuildReport(
    context: WechatTargetContext,
    outputDirectory: string,
): Promise<WechatBuildReport> {
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
    context: WechatTargetContext,
    relativePath: string,
    diagnostics: WechatTargetDiagnostic[],
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
