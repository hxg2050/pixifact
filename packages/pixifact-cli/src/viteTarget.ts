import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import {
    build,
    createServer,
    resolveConfig,
    type Rollup,
} from 'vite';
import {
    parsePixifactProjectConfig,
    pixifactProjectConfigFileName,
    type PixifactProjectConfig,
} from 'pixifact';
import {
    compilerSceneNodeLocator,
    parseSceneTemplate,
    type SceneTemplateNode,
} from 'pixifact/compiler';
import {
    loadPixifactEnv,
    pixifactBuildReporter,
    type PixifactBuildReport,
    type PixifactPlatform,
} from 'pixifact/compiler-node';

export interface PixifactTargetDiagnostic {
    asset?: string;
    message: string;
    node?: string;
    scene?: string;
}

export type PixifactDevEvent = {
    type: 'built';
    report: PixifactBuildReport;
} | {
    type: 'error';
    error: string;
};

export interface PixifactDevSession {
    close(): Promise<void>;
    initialReport: PixifactBuildReport;
    platform: PixifactPlatform;
}

export class PixifactTargetError extends Error {
    constructor(
        message: string,
        readonly diagnostics: PixifactTargetDiagnostic[],
    ) {
        super(message);
        this.name = 'PixifactTargetError';
    }
}

export async function validatePixifactTarget(projectRootInput: string, mode: string) {
    const projectRoot = path.resolve(projectRootInput);
    const { platform } = loadPixifactEnv(projectRoot, mode);
    const config = parsePixifactProjectConfig(JSON.parse(await readFile(
        path.join(projectRoot, pixifactProjectConfigFileName),
        'utf8',
    )));
    const diagnostics = await collectDiagnostics(projectRoot, config, platform);
    const resolved = await resolveConfig({ root: projectRoot, mode, logLevel: 'silent' }, 'build', mode);
    const pluginNames = new Set(resolved.plugins.map((plugin) => plugin.name));
    for (const name of [
        'pixifact-scenes',
        'pixifact-platform',
        'pixifact-assets',
        'pixifact-resources',
        'pixifact-minigame',
    ]) {
        if (!pluginNames.has(name)) {
            diagnostics.push({ message: `vite.config.ts must include pixifact(); missing ${name}.` });
            break;
        }
    }
    if (platform !== 'web') {
        const packageName = `@pixifact/platform-${platform}`;
        const resolve = resolved.createResolver();
        if (!await resolve(packageName, path.join(projectRoot, 'src/main.ts'))) {
            diagnostics.push({
                message: `缺少 ${packageName}；请运行 bun add ${packageName}。`,
            });
        }
    }
    return { config, diagnostics, mode, platform, projectRoot, resolved };
}

export async function buildPixifactTarget(
    projectRootInput: string,
    mode: string,
): Promise<PixifactBuildReport> {
    const validation = await validatePixifactTarget(projectRootInput, mode);
    if (validation.diagnostics.length > 0) {
        throw new PixifactTargetError('Pixifact target validation failed.', validation.diagnostics);
    }
    let report: PixifactBuildReport | undefined;
    await build({
        root: validation.projectRoot,
        mode,
        logLevel: 'silent',
        plugins: [pixifactBuildReporter(validation.platform, (value) => {
            report = value;
        })],
    });
    if (!report) throw new Error('Vite completed without a Pixifact build report.');
    return report;
}

export async function devPixifactTarget(
    projectRootInput: string,
    mode: string,
    onEvent: (event: PixifactDevEvent) => void = () => undefined,
): Promise<PixifactDevSession> {
    const validation = await validatePixifactTarget(projectRootInput, mode);
    if (validation.diagnostics.length > 0) {
        throw new PixifactTargetError('Pixifact target validation failed.', validation.diagnostics);
    }
    if (validation.platform === 'web') {
        const server = await createServer({
            root: validation.projectRoot,
            mode,
            logLevel: 'silent',
        });
        await server.listen();
        return {
            close: () => server.close(),
            initialReport: emptyReport('web', validation.resolved.build.outDir),
            platform: 'web',
        };
    }
    let resolveInitial: (report: PixifactBuildReport) => void;
    let rejectInitial: (error: Error) => void;
    const initial = new Promise<PixifactBuildReport>((resolve, reject) => {
        resolveInitial = resolve;
        rejectInitial = reject;
    });
    let first = true;
    let completedReport: PixifactBuildReport | undefined;
    const watcher = await build({
        root: validation.projectRoot,
        mode,
        logLevel: 'silent',
        build: { watch: {} },
        plugins: [pixifactBuildReporter(validation.platform, (report) => {
            completedReport = report;
        })],
    }) as Rollup.RollupWatcher;
    watcher.on('event', (event) => {
        if (event.code === 'END' && completedReport) {
            const report = completedReport;
            completedReport = undefined;
            if (first) {
                first = false;
                resolveInitial(report);
            } else {
                onEvent({ type: 'built', report });
            }
        } else if (event.code === 'ERROR') {
            const error = event.error instanceof Error ? event.error : new Error(String(event.error));
            if (first) {
                first = false;
                rejectInitial(error);
            } else {
                onEvent({ type: 'error', error: error.message });
            }
        }
    });
    return {
        close: () => watcher.close(),
        initialReport: await initial,
        platform: validation.platform,
    };
}

async function collectDiagnostics(
    projectRoot: string,
    config: PixifactProjectConfig,
    platform: PixifactPlatform,
) {
    const diagnostics: PixifactTargetDiagnostic[] = [];
    await requireFile(projectRoot, 'src/main.ts', diagnostics, '应用入口 src/main.ts 不存在。');
    if (platform !== 'web') {
        await requireFile(projectRoot, `platforms/${platform}/game.json`, diagnostics, `${platform} game.json 不存在。`);
        await requireFile(
            projectRoot,
            `platforms/${platform}/project.config.json`,
            diagnostics,
            `${platform} project.config.json 不存在。`,
        );
    }
    for (const pack of config.resourcePacks ?? []) {
        const root = path.join(projectRoot, 'resources', pack);
        if (!await isDirectory(root)) {
            diagnostics.push({ asset: `resources/${pack}`, message: `资源包 ${pack} 的目录不存在。` });
            continue;
        }
        if (platform !== 'web') {
            for (const file of await collectFiles(root)) {
                if (path.extname(file).toLowerCase() === '.svg') {
                    diagnostics.push({
                        asset: projectPath(projectRoot, file),
                        message: `${platform} 小游戏不支持 SVG 资源。`,
                    });
                }
            }
        }
    }
    for (const scene of Object.values(config.scenes)) {
        if (!await exists(path.join(projectRoot, scene))) {
            diagnostics.push({ asset: scene, message: 'Scene 文件不存在。' });
            continue;
        }
        if (platform === 'web') continue;
        const template = parseSceneTemplate(await readFile(path.join(projectRoot, scene), 'utf8'));
        await collectSceneDiagnostics(template.children, scene, '', projectRoot, platform, diagnostics);
    }
    if (platform !== 'web') {
        const gameJsonPath = path.join(projectRoot, 'platforms', platform, 'game.json');
        if (await exists(gameJsonPath)) {
            const gameJson = JSON.parse(await readFile(gameJsonPath, 'utf8')) as Record<string, unknown>;
            const property = platform === 'wechat' ? 'subpackages' : 'subPackages';
            if (gameJson[property] !== undefined) {
                diagnostics.push({
                    asset: `platforms/${platform}/game.json`,
                    message: `${property} 由 Pixifact 根据 resourcePacks 生成，不能在源模板中重复声明。`,
                });
            }
        }
    }
    return diagnostics;
}

async function collectSceneDiagnostics(
    nodes: SceneTemplateNode[],
    scene: string,
    parentPath: string,
    projectRoot: string,
    platform: Exclude<PixifactPlatform, 'web'>,
    diagnostics: PixifactTargetDiagnostic[],
) {
    for (const [index, node] of nodes.entries()) {
        const nodePath = parentPath ? `${parentPath}/${index}` : String(index);
        if (node.kind === 'slotOutlet') continue;
        if (node.kind === 'sceneInstance') {
            for (const [slotName, children] of Object.entries(node.slots)) {
                await collectSceneDiagnostics(children, scene, `${nodePath}/slot:${slotName}`, projectRoot, platform, diagnostics);
            }
            continue;
        }
        const locator = compilerSceneNodeLocator(node, nodePath);
        if (node.type === 'HTMLText' || node.type === 'DOMContainer') {
            diagnostics.push({ message: `${platform} 小游戏不支持 ${node.type}。`, node: locator, scene });
        }
        if (typeof node.props.texture === 'string') {
            const texture = node.props.texture;
            const extension = path.extname(texture).toLowerCase();
            if (!isProjectAssetPath(texture)) {
                diagnostics.push({ asset: texture, message: `${platform} 小游戏 Scene 纹理必须使用项目相对路径。`, node: locator, scene });
            } else if (!['.jpeg', '.jpg', '.png', '.webp'].includes(extension)) {
                diagnostics.push({ asset: texture, message: `${platform} 小游戏 Scene 纹理不支持 ${extension || '无扩展名'} 格式。`, node: locator, scene });
            } else if (!await exists(path.join(projectRoot, texture))) {
                diagnostics.push({ asset: texture, message: `${platform} 小游戏 Scene 纹理文件不存在。`, node: locator, scene });
            }
        }
        await collectSceneDiagnostics(node.children, scene, nodePath, projectRoot, platform, diagnostics);
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

async function requireFile(
    projectRoot: string,
    relativePath: string,
    diagnostics: PixifactTargetDiagnostic[],
    message: string,
) {
    if (!await exists(path.join(projectRoot, relativePath))) diagnostics.push({ asset: relativePath, message });
}

async function collectFiles(root: string): Promise<string[]> {
    const files: string[] = [];
    for (const entry of await readdir(root, { withFileTypes: true })) {
        const absolute = path.join(root, entry.name);
        if (entry.isDirectory()) files.push(...await collectFiles(absolute));
        else if (entry.isFile()) files.push(absolute);
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

function emptyReport(platform: PixifactPlatform, outputDirectory: string): PixifactBuildReport {
    return { mainPackageBytes: 0, outputDirectory, platform, subpackages: {}, totalPackageBytes: 0 };
}

function projectPath(root: string, filePath: string) {
    return path.relative(root, filePath).replaceAll(path.sep, '/');
}
