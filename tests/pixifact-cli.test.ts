import fs from 'node:fs';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSceneRevision } from 'pixifact/compiler';
import { hintForCommandError } from 'pixifact';
import { executePixifactCli } from '../packages/pixifact-cli/src/pixifact-cli';

const tempRoots: string[] = [];
const execFileAsync = promisify(execFile);

function createTempProject() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pixifact-cli-'));
    tempRoots.push(root);
    fs.mkdirSync(path.join(root, 'src', 'scenes'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'scenes', 'Button.scene'), [
        '<Scene name="Button">',
        '  <Text id="label" text="Start" />',
        '</Scene>',
        '',
    ].join('\n'), 'utf8');
    fs.writeFileSync(path.join(root, 'src', 'scenes', 'Button.ts'), [
        'import { Group } from "pixifact/runtime";',
        'import { scene } from "pixifact/scene";',
        '',
        '@scene()',
        'export class Button extends Group {}',
        '',
    ].join('\n'), 'utf8');
    return root;
}

function createEmptyTempProject() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pixifact-cli-'));
    tempRoots.push(root);
    fs.mkdirSync(path.join(root, 'scenes'), { recursive: true });
    return root;
}

function createCompilerSceneProject() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pixifact-compiler-cli-'));
    tempRoots.push(root);
    fs.mkdirSync(path.join(root, 'src', 'scenes'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'scenes', 'Button.scene'), [
        '<Scene name="Button">',
        '  <Text id="label" text="Start" />',
        '</Scene>',
        '',
    ].join('\n'), 'utf8');
    fs.writeFileSync(path.join(root, 'src', 'scenes', 'Button.ts'), [
        'import { Group } from "pixifact/runtime";',
        'import { scene } from "pixifact/scene";',
        '',
        '@scene()',
        'export class Button extends Group {}',
        '',
    ].join('\n'), 'utf8');
    return root;
}

function createViteTargetProject() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pixifact-vite-cli-'));
    tempRoots.push(root);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'main.ts'), [
        "console.info('mode', import.meta.env.MODE, import.meta.env.VITE_PLATFORM);",
        '',
    ].join('\n'));
    fs.writeFileSync(
        path.join(root, 'index.html'),
        '<script type="module" src="/src/main.ts"></script>\n',
    );
    fs.writeFileSync(path.join(root, 'pixifact.project.json'), JSON.stringify({
        version: 2,
        name: 'Vite CLI Fixture',
        scenes: {},
    }, null, 2));
    fs.writeFileSync(path.join(root, '.env.production'), 'VITE_PLATFORM=web\n');
    fs.writeFileSync(path.join(root, '.env.game1'), 'VITE_PLATFORM=web\n');
    const compilerNode = path.join(process.cwd(), 'packages/pixifact/src/compiler-node/index.ts');
    fs.writeFileSync(path.join(root, 'vite.config.ts'), [
        `import { pixifact } from ${JSON.stringify(compilerNode)};`,
        `export default { plugins: [pixifact({ projectRoot: ${JSON.stringify(root)} })] };`,
        '',
    ].join('\n'));
    return root;
}

async function runCli(argv: string[]) {
    const result = await executePixifactCli(argv);
    return {
        ...result,
        json: JSON.parse(result.stdout || result.stderr),
    };
}

afterEach(() => {
    for (const root of tempRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('Pixifact CLI', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    it('runs the CLI entry when Bun executes its source file', async () => {
        if (!process.versions.bun) return;

        const cliPath = path.join(process.cwd(), 'packages/pixifact-cli/src/pixifact-cli.ts');
        const { stdout, stderr } = await execFileAsync(process.execPath, [cliPath, '--help']);

        expect(stderr).toBe('');
        expect(JSON.parse(stdout)).toMatchObject({
            aiPrimaryCommands: expect.arrayContaining(['summary', 'scene inspect --scene <scene-path>']),
        });
    });

    it('outputs a project summary as JSON', async () => {
        const projectRoot = createTempProject();
        const result = await runCli(['summary', '--project-root', projectRoot]);

        expect(result.exitCode).toBe(0);
        expect(result.json.scenes).toContain('src/scenes/Button.scene');
    });

    it('defaults file commands to the current working directory', async () => {
        const projectRoot = createCompilerSceneProject();
        const originalCwd = process.cwd();

        try {
            process.chdir(projectRoot);
            const summary = await runCli(['summary']);
            const inspected = await runCli([
                'scene',
                'inspect',
                '--scene',
                'src/scenes/Button.scene',
            ]);
            const validated = await runCli([
                'scene',
                'validate',
                '--scene',
                'src/scenes/Button.scene',
            ]);

            expect(summary.exitCode).toBe(0);
            expect(summary.json.scenes).toContain('src/scenes/Button.scene');
            expect(inspected.exitCode).toBe(0);
            expect(inspected.json.scenePath).toBe('src/scenes/Button.scene');
            expect(validated.exitCode).toBe(0);
            expect(validated.json.scenePath).toBe('src/scenes/Button.scene');
        } finally {
            process.chdir(originalCwd);
        }
    });

    it('groups help output around the AI primary path', async () => {
        const result = await runCli(['--help']);

        expect(result.exitCode).toBe(0);
        expect(result.json).toEqual({
            aiPrimaryCommands: [
                'summary',
                'scene inspect --scene <scene-path>',
                'scene validate --scene <scene-path>',
                'compile-scenes',
                'validate [--mode <vite-mode>]',
                'build [--mode <vite-mode>]',
                'dev [--mode <vite-mode>]',
            ],
            aiValidationAlternatives: [
                'scene validate --all',
            ],
            runtimeCommands: [
                'runtime list',
                'runtime tree [--output <json-path>] [--runtime <runtime-id>]',
                'runtime screenshot --output <png-path> [--runtime <runtime-id>]',
                'runtime node <pixi-uid> [--runtime <runtime-id>]',
                'runtime state [--runtime <runtime-id>]',
                'runtime logs [--after <seq>] [--level <level>] [--runtime <runtime-id>]',
                'runtime input click --x <x> --y <y> [--runtime <runtime-id>]',
                'runtime input move --x <x> --y <y> [--runtime <runtime-id>]',
                'runtime input key <key> [--runtime <runtime-id>]',
                'runtime input keydown <key> [--runtime <runtime-id>]',
                'runtime input keyup <key> [--runtime <runtime-id>]',
            ],
            auxiliaryCommands: [
                'editor',
                'editor context',
                'editor screenshot --output <png-path>',
                'scene create --scene <scene-path> --name <SceneName>',
                'node inspect --scene <scene-path> --node <locator>',
            ],
            nodeLocatorSource: 'scene inspect --scene <scene-path> returns node locator values',
            defaults: {
                projectRoot: 'current working directory',
            },
        });
    });

    it('rejects flags outside the Vite mode command contract', async () => {
        const result = await runCli(['validate', '--target', 'wechat']);

        expect(result.exitCode).toBe(1);
        expect(result.json.error).toBe('Unknown option "--target" for Pixifact validate.');
    });

    it('provides installation hints for optional platform packages', () => {
        expect(hintForCommandError('Could not resolve "@pixifact/platform-wechat"')).toBe(
            'Install the WeChat platform package with: bun add @pixifact/platform-wechat',
        );
        expect(hintForCommandError('Cannot find package @pixifact/platform-douyin')).toBe(
            'Install the Douyin platform package with: bun add @pixifact/platform-douyin',
        );
    });

    it('uses production by default and passes arbitrary Vite modes through', async () => {
        const projectRoot = createViteTargetProject();

        const validated = await runCli(['validate', '--project-root', projectRoot]);
        const built = await runCli(['build', '--mode', 'game1', '--project-root', projectRoot]);

        expect(validated.exitCode).toBe(0);
        expect(validated.json).toMatchObject({ mode: 'production', platform: 'web' });
        expect(built.exitCode, JSON.stringify(built.json)).toBe(0);
        expect(built.json).toMatchObject({ mode: 'game1', platform: 'web' });
        expect(fs.existsSync(path.join(projectRoot, 'dist', 'web', 'index.html'))).toBe(true);
    }, 30_000);

    it('uses development as the default dev mode', async () => {
        const projectRoot = createViteTargetProject();
        fs.writeFileSync(path.join(projectRoot, '.env.development'), 'VITE_PLATFORM=invalid\n');

        const result = await runCli(['dev', '--project-root', projectRoot]);

        expect(result.exitCode).toBe(1);
        expect(result.json.error).toBe('VITE_PLATFORM must be web, wechat, or douyin.');
    });

    it('requires VITE_APP_ID only for mini game modes', async () => {
        const projectRoot = createViteTargetProject();
        fs.writeFileSync(path.join(projectRoot, '.env.wechat'), 'VITE_PLATFORM=wechat\n');

        const result = await runCli([
            'validate',
            '--mode',
            'wechat',
            '--project-root',
            projectRoot,
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.json.error).toBe('VITE_APP_ID is required for the wechat platform.');
    });

    it('reports the install command when the selected platform package is missing', async () => {
        const projectRoot = createViteTargetProject();
        fs.mkdirSync(path.join(projectRoot, 'platforms', 'wechat'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'platforms', 'wechat', 'game.json'), '{}\n');
        fs.writeFileSync(path.join(projectRoot, 'platforms', 'wechat', 'project.config.json'), '{}\n');
        fs.writeFileSync(
            path.join(projectRoot, '.env.wechat'),
            'VITE_PLATFORM=wechat\nVITE_APP_ID=wx-app-id\n',
        );

        const result = await runCli([
            'validate',
            '--mode',
            'wechat',
            '--project-root',
            projectRoot,
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.json.diagnostics).toContainEqual({
            message: '缺少 @pixifact/platform-wechat；请运行 bun add @pixifact/platform-wechat。',
        });
    });

    it('lists runtime pages for the current project', async () => {
        const projectRoot = createTempProject();
        const listRuntimes = vi.fn(async () => ({
            ok: true,
            runtimes: [{
                runtimeId: 'runtime-a',
                title: 'Adventure',
                url: 'http://127.0.0.1:5178/',
                ready: true,
            }],
        }));

        const result = await executePixifactCli([
            'runtime',
            'list',
            '--project-root',
            projectRoot,
        ], { listRuntimes });

        expect(result.exitCode).toBe(0);
        expect(listRuntimes).toHaveBeenCalledWith({ projectRoot });
        expect(JSON.parse(result.stdout)).toMatchObject({
            ok: true,
            runtimes: [{ runtimeId: 'runtime-a' }],
        });
    });

    it('queries tree, node, state, and filtered logs through the selected runtime', async () => {
        const projectRoot = createTempProject();
        const queryRuntime = vi.fn(async ({ request }: { request: { type: string } }) => ({
            runtimeId: 'runtime-a',
            requestType: request.type,
        }));

        const tree = await executePixifactCli([
            'runtime',
            'tree',
            '--project-root',
            projectRoot,
        ], { queryRuntime });
        const node = await executePixifactCli([
            'runtime',
            'node',
            '42',
            '--runtime',
            'runtime-a',
            '--project-root',
            projectRoot,
        ], { queryRuntime });
        const state = await executePixifactCli([
            'runtime',
            'state',
            '--project-root',
            projectRoot,
        ], { queryRuntime });
        const logs = await executePixifactCli([
            'runtime',
            'logs',
            '--after',
            '12',
            '--level',
            'error',
            '--project-root',
            projectRoot,
        ], { queryRuntime });

        expect([tree, node, state, logs].map((result) => result.exitCode)).toEqual([0, 0, 0, 0]);
        expect(queryRuntime).toHaveBeenNthCalledWith(1, {
            projectRoot,
            runtimeId: undefined,
            request: { type: 'tree' },
        });
        expect(queryRuntime).toHaveBeenNthCalledWith(2, {
            projectRoot,
            runtimeId: 'runtime-a',
            request: { type: 'node', uid: 42 },
        });
        expect(queryRuntime).toHaveBeenNthCalledWith(3, {
            projectRoot,
            runtimeId: undefined,
            request: { type: 'state' },
        });
        expect(queryRuntime).toHaveBeenNthCalledWith(4, {
            projectRoot,
            runtimeId: undefined,
            request: { type: 'logs', after: 12, level: 'error' },
        });
    });

    it('writes a runtime tree snapshot to a JSON file when requested', async () => {
        const projectRoot = createTempProject();
        const output = path.join(projectRoot, '.pixifact', 'runtime', 'tree.json');
        const queryRuntime = vi.fn(async () => ({
            runtimeId: 'runtime-a',
            root: {
                uid: 1,
                type: 'Container',
                label: 'stage',
                children: [{ uid: 2, type: 'Text', label: '背包', children: [] }],
            },
        }));

        const result = await executePixifactCli([
            'runtime',
            'tree',
            '--output',
            output,
            '--project-root',
            projectRoot,
        ], { queryRuntime });

        expect(result.exitCode).toBe(0);
        expect(queryRuntime).toHaveBeenCalledWith({
            projectRoot,
            runtimeId: undefined,
            request: { type: 'tree' },
        });
        const snapshot = JSON.parse(fs.readFileSync(output, 'utf8')) as Record<string, unknown>;
        expect(snapshot).toMatchObject({
            schemaVersion: 1,
            runtimeId: 'runtime-a',
            root: {
                uid: 1,
                children: [{ uid: 2, label: '背包' }],
            },
        });
        expect(typeof snapshot.capturedAt).toBe('string');
        expect(JSON.parse(result.stdout)).toMatchObject({
            ok: true,
            output: path.resolve(output),
            runtimeId: 'runtime-a',
        });
    });

    it('does not write a runtime tree snapshot when the request fails', async () => {
        const projectRoot = createTempProject();
        const output = path.join(projectRoot, 'failed-tree.json');
        const queryRuntime = vi.fn(async () => ({
            ok: false,
            error: 'No Pixifact Runtime game page is connected for this project.',
        }));

        const result = await executePixifactCli([
            'runtime',
            'tree',
            '--output',
            output,
            '--project-root',
            projectRoot,
        ], { queryRuntime });

        expect(result.exitCode).toBe(1);
        expect(fs.existsSync(output)).toBe(false);
        expect(JSON.parse(result.stderr)).toMatchObject({
            ok: false,
            error: 'No Pixifact Runtime game page is connected for this project.',
        });
    });

    it('writes a runtime screenshot to the required output path', async () => {
        const projectRoot = createTempProject();
        const output = path.join(projectRoot, '.pixifact', 'runtime', 'frame.png');
        const data = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
        const captureRuntimeScreenshot = vi.fn(async () => ({
            ok: true as const,
            runtimeId: 'runtime-a',
            width: 750,
            height: 1334,
            data,
        }));

        const result = await executePixifactCli([
            'runtime',
            'screenshot',
            '--project-root',
            projectRoot,
            '--output',
            output,
        ], { captureRuntimeScreenshot });

        expect(result.exitCode).toBe(0);
        expect(captureRuntimeScreenshot).toHaveBeenCalledWith({
            projectRoot,
            runtimeId: undefined,
        });
        expect(fs.readFileSync(output)).toEqual(Buffer.from(data));
        expect(JSON.parse(result.stdout)).toEqual({
            ok: true,
            runtimeId: 'runtime-a',
            width: 750,
            height: 1334,
            bytes: data.byteLength,
            output: path.resolve(output),
            capturedAt: expect.any(String),
        });
    });

    it('requires an output path before requesting a runtime screenshot', async () => {
        const projectRoot = createTempProject();
        const captureRuntimeScreenshot = vi.fn();

        const result = await executePixifactCli([
            'runtime',
            'screenshot',
            '--project-root',
            projectRoot,
        ], { captureRuntimeScreenshot });

        expect(result.exitCode).toBe(1);
        expect(captureRuntimeScreenshot).not.toHaveBeenCalled();
        expect(JSON.parse(result.stderr)).toMatchObject({
            ok: false,
            error: '--output must include a value.',
        });
    });

    it('does not write a runtime screenshot when capture fails', async () => {
        const projectRoot = createTempProject();
        const output = path.join(projectRoot, 'failed.png');
        const captureRuntimeScreenshot = vi.fn(async () => ({
            ok: false as const,
            error: 'No Pixifact Runtime game page is connected for this project.',
        }));

        const result = await executePixifactCli([
            'runtime',
            'screenshot',
            '--project-root',
            projectRoot,
            '--output',
            output,
        ], { captureRuntimeScreenshot });

        expect(result.exitCode).toBe(1);
        expect(fs.existsSync(output)).toBe(false);
        expect(JSON.parse(result.stderr)).toMatchObject({
            ok: false,
            error: 'No Pixifact Runtime game page is connected for this project.',
        });
    });

    it('maps pointer and keyboard CLI commands to limited runtime input requests', async () => {
        const projectRoot = createTempProject();
        const queryRuntime = vi.fn(async () => ({ runtimeId: 'runtime-a', dispatched: true }));

        const click = await executePixifactCli([
            'runtime',
            'input',
            'click',
            '--x',
            '375',
            '--y',
            '667',
            '--project-root',
            projectRoot,
        ], { queryRuntime });
        const key = await executePixifactCli([
            'runtime',
            'input',
            'keydown',
            'ArrowLeft',
            '--runtime',
            'runtime-a',
            '--project-root',
            projectRoot,
        ], { queryRuntime });

        expect(click.exitCode).toBe(0);
        expect(key.exitCode).toBe(0);
        expect(queryRuntime).toHaveBeenNthCalledWith(1, {
            projectRoot,
            runtimeId: undefined,
            request: { type: 'input', action: 'click', x: 375, y: 667 },
        });
        expect(queryRuntime).toHaveBeenNthCalledWith(2, {
            projectRoot,
            runtimeId: 'runtime-a',
            request: { type: 'input', action: 'keydown', key: 'ArrowLeft' },
        });
    });

    it('rejects invalid runtime uid, log filters, and input coordinates before transport', async () => {
        const queryRuntime = vi.fn();

        const invalidNode = await executePixifactCli(['runtime', 'node', 'hero'], { queryRuntime });
        const invalidLogs = await executePixifactCli([
            'runtime',
            'logs',
            '--level',
            'fatal',
        ], { queryRuntime });
        const invalidInput = await executePixifactCli([
            'runtime',
            'input',
            'click',
            '--x',
            'center',
            '--y',
            '10',
        ], { queryRuntime });

        expect([invalidNode, invalidLogs, invalidInput].map((result) => result.exitCode)).toEqual([1, 1, 1]);
        expect(queryRuntime).not.toHaveBeenCalled();
        expect(JSON.parse(invalidNode.stderr).error).toBe('Runtime node uid must be a non-negative integer.');
        expect(JSON.parse(invalidLogs.stderr).error).toBe(
            '--level must be debug, log, info, warn, or error.',
        );
        expect(JSON.parse(invalidInput.stderr).error).toBe('--x must be a finite number.');
    });

    it('starts the browser editor for the current project', async () => {
        const projectRoot = createTempProject();
        const startEditor = vi.fn(async () => ({ url: 'http://127.0.0.1:43120' }));

        const result = await executePixifactCli(['editor', '--project-root', projectRoot], { startEditor });
        const parsed = JSON.parse(result.stdout);

        expect(result.exitCode).toBe(0);
        expect(startEditor).toHaveBeenCalledWith({ projectRoot });
        expect(parsed).toEqual({
            ok: true,
            projectRoot,
            url: 'http://127.0.0.1:43120',
        });
    });

    it('reads the current project Editor context without exposing mutation', async () => {
        const projectRoot = createTempProject();
        const context = {
            protocolVersion: 3,
            projectRoot,
            editor: { connected: true, updatedAt: '2026-08-03T08:00:00.000Z' },
            scene: {
                path: 'src/scenes/Button.scene',
                revision: 'sha256:current',
                syncState: 'synced',
            },
            selection: {
                kind: 'node',
                locator: '0:label',
                node: {
                    kind: 'pixi',
                    type: 'Text',
                    id: 'label',
                    props: { text: 'Start' },
                    childCount: 0,
                },
            },
        };
        const readEditorContext = vi.fn(async () => context);

        const result = await executePixifactCli([
            'editor',
            'context',
            '--project-root',
            projectRoot,
        ], { readEditorContext });

        expect(result.exitCode).toBe(0);
        expect(readEditorContext).toHaveBeenCalledWith({ projectRoot });
        expect(JSON.parse(result.stdout)).toEqual(context);
    });

    it('writes the active Editor authoring Scene screenshot to the required output path', async () => {
        const projectRoot = createTempProject();
        const output = path.join(projectRoot, 'scene.png');
        const data = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
        const captureEditorScreenshot = vi.fn(async () => ({
            ok: true as const,
            scene: 'src/scenes/Button.scene',
            revision: 'sha256:current',
            width: 120,
            height: 40,
            data,
        }));

        const result = await executePixifactCli([
            'editor',
            'screenshot',
            '--project-root',
            projectRoot,
            '--output',
            output,
        ], { captureEditorScreenshot });

        expect(result.exitCode).toBe(0);
        expect(captureEditorScreenshot).toHaveBeenCalledWith({ projectRoot });
        expect(fs.readFileSync(output)).toEqual(Buffer.from(data));
        expect(JSON.parse(result.stdout)).toEqual({
            ok: true,
            scene: 'src/scenes/Button.scene',
            revision: 'sha256:current',
            width: 120,
            height: 40,
            bytes: data.byteLength,
            output,
        });
    });

    it('requires an output path before requesting an Editor screenshot', async () => {
        const projectRoot = createTempProject();
        const captureEditorScreenshot = vi.fn();

        const result = await executePixifactCli([
            'editor',
            'screenshot',
            '--project-root',
            projectRoot,
        ], { captureEditorScreenshot });

        expect(result.exitCode).toBe(1);
        expect(captureEditorScreenshot).not.toHaveBeenCalled();
        expect(JSON.parse(result.stderr)).toMatchObject({
            ok: false,
            error: '--output must include a value.',
        });
    });

    it('does not write an output file when Editor screenshot capture fails', async () => {
        const projectRoot = createTempProject();
        const output = path.join(projectRoot, 'failed.png');
        const captureEditorScreenshot = vi.fn(async () => ({
            ok: false as const,
            error: 'Editor Scene preview is not ready.',
            previewState: 'loading',
        }));

        const result = await executePixifactCli([
            'editor',
            'screenshot',
            '--project-root',
            projectRoot,
            '--output',
            output,
        ], { captureEditorScreenshot });

        expect(result.exitCode).toBe(1);
        expect(fs.existsSync(output)).toBe(false);
        expect(JSON.parse(result.stderr)).toMatchObject({
            ok: false,
            error: 'Editor Scene preview is not ready.',
            previewState: 'loading',
        });
    });

    it('includes pixifact project run config in summary without running it', async () => {
        const projectRoot = createTempProject();
        fs.writeFileSync(path.join(projectRoot, 'pixifact.project.json'), JSON.stringify({
            version: 2,
            name: 'Space HUD Game',
            scenes: {
                hud: 'src/scenes/Button.scene',
            },
            run: {
                command: 'bun',
                args: ['run', 'dev'],
                cwd: '.',
                url: 'http://localhost:5173',
            },
        }), 'utf8');

        const result = await runCli(['summary', '--project-root', projectRoot]);

        expect(result.exitCode).toBe(0);
        expect(result.json.project).toEqual({
            name: 'Space HUD Game',
            resolution: {
                width: 750,
                height: 1334,
            },
            viewport: {
                mode: 'showAll',
            },
            scenes: {
                hud: 'src/scenes/Button.scene',
            },
            run: {
                command: 'bun',
                args: ['run', 'dev'],
                cwd: '.',
                url: 'http://localhost:5173',
            },
        });
    });

    it('creates a new compiler Scene file pair', async () => {
        const projectRoot = createCompilerSceneProject();

        const result = await runCli([
            'scene',
            'create',
            '--project-root',
            projectRoot,
            '--scene',
            'src/scenes/Login.scene',
            '--name',
            'Login',
        ]);
        const savedScene = fs.readFileSync(path.join(projectRoot, 'src/scenes/Login.scene'), 'utf8');
        const savedScript = fs.readFileSync(path.join(projectRoot, 'src/scenes/Login.ts'), 'utf8');

        expect(result.exitCode).toBe(0);
        expect(result.json).toMatchObject({
            ok: true,
            scenePath: 'src/scenes/Login.scene',
            scriptPath: 'src/scenes/Login.ts',
            summary: {
                name: 'Login',
                nodeCount: 0,
            },
        });
        expect(savedScene).toBe('<Scene name="Login">\n</Scene>\n');
        expect(savedScript).toContain('export class Login extends Group');
    });


    it('compiles Pixifact scene templates through the CLI', async () => {
        const projectRoot = createEmptyTempProject();
        fs.mkdirSync(path.join(projectRoot, 'src', 'scenes'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'Button.scene'), `
            <Scene name="Button" width="120" height="40">
              <Text id="labelText" text="Button" />
            </Scene>
        `);
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'Button.ts'), `
            import { Text } from 'pixi.js';
import { Group } from 'pixifact/runtime';
            import { part, prop, scene } from 'pixifact/scene';

            @scene()
            export class Button extends Group {
                @part()
                protected declare labelText: Text;

                @prop({ default: 'Button' })
                declare label: string;
            }
        `);

        const result = await runCli(['compile-scenes', '--project-root', projectRoot]);
        const generated = fs.readFileSync(path.join(projectRoot, '.pixifact', 'generated', 'src', 'scenes', 'Button.scene.generated.ts'), 'utf8');

        expect(result.exitCode).toBe(0);
        expect(result.json).toMatchObject({
            ok: true,
            projectRoot,
        });
        expect(generated).toContain('export function mountButtonScene(root: Group)');
        expect(generated).toContain('registerSceneClass(SceneClass_src_scenes_Button, "src/scenes/Button.scene");');
    });

    it('inspects compiler scene files for external agents', async () => {
        const projectRoot = createCompilerSceneProject();
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'BaseControl.scene'), '<Scene name="BaseControl" />\n', 'utf8');
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'BaseControl.ts'), [
            'import { Group } from "pixifact/runtime";',
            'import { prop, scene, slot } from "pixifact/scene";',
            '',
            '@scene()',
            'export class BaseControl extends Group {',
            '  @prop({ default: 8 })',
            '  declare padding: number;',
            '',
            '  @slot()',
            '  default!: unknown;',
            '}',
            '',
        ].join('\n'), 'utf8');
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'Button.ts'), [
            'import { prop, scene } from "pixifact/scene";',
            'import { BaseControl } from "./BaseControl";',
            '',
            '@scene()',
            'export class Button extends BaseControl {',
            '  @prop({ default: "Button" })',
            '  declare label: string;',
            '}',
            '',
        ].join('\n'), 'utf8');

        const result = await runCli([
            'scene',
            'inspect',
            '--project-root',
            projectRoot,
            '--scene',
            'src/scenes/Button.scene',
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.json).toMatchObject({
            ok: true,
            scenePath: 'src/scenes/Button.scene',
            revision: createSceneRevision(fs.readFileSync(path.join(projectRoot, 'src', 'scenes', 'Button.scene'), 'utf8')),
            summary: {
                name: 'Button',
                nodeCount: 1,
            },
            interface: {
                props: {
                    padding: {
                        type: 'number',
                        default: 8,
                    },
                    label: {
                        type: 'string',
                        default: 'Button',
                    },
                },
                slots: {
                    default: {},
                },
            },
        });
    });

    it('explains how to refresh an invalid Compiler node locator', async () => {
        const projectRoot = createCompilerSceneProject();

        const result = await runCli([
            'node',
            'inspect',
            '--project-root',
            projectRoot,
            '--scene',
            'src/scenes/Button.scene',
            '--node',
            '0:missing',
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.json).toMatchObject({
            ok: false,
            error: 'Node locator "0:missing" was not found.',
            hint: 'Run scene inspect --scene <scene-path> and pass one of the returned node locator values.',
        });
        expect(result.json.hint).not.toContain('scene get');
    });

    it('does not expose duplicate scene get as a file command', async () => {
        const projectRoot = createCompilerSceneProject();

        const result = await runCli([
            'scene',
            'get',
            '--project-root',
            projectRoot,
            '--scene',
            'src/scenes/Button.scene',
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.json).toMatchObject({
            ok: false,
            error: 'Unknown Pixifact CLI command "scene get".',
        });
    });

    it('validates compiler scene files after direct edits', async () => {
        const projectRoot = createCompilerSceneProject();

        const result = await runCli([
            'scene',
            'validate',
            '--project-root',
            projectRoot,
            '--scene',
            'src/scenes/Button.scene',
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.json).toMatchObject({
            ok: true,
            scenePath: 'src/scenes/Button.scene',
            revision: createSceneRevision(fs.readFileSync(path.join(projectRoot, 'src', 'scenes', 'Button.scene'), 'utf8')),
            summary: {
                name: 'Button',
                nodeCount: 1,
            },
        });
    });

    it('validates bindings against the paired owner Scene contract', async () => {
        const projectRoot = createCompilerSceneProject();
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'Button.scene'), [
            '<Scene name="Button">',
            '  <Text id="label" text="{missing}" />',
            '</Scene>',
            '',
        ].join('\n'), 'utf8');

        const result = await runCli([
            'scene',
            'validate',
            '--project-root',
            projectRoot,
            '--scene',
            'src/scenes/Button.scene',
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.json).toMatchObject({
            ok: false,
            scene: 'src/scenes/Button.scene',
            error: 'Scene validation failed.',
            diagnostics: [{
                path: '0:label',
                prop: 'text',
                expected: 'Scene Prop declared by the paired script',
                actual: 'unknown binding prop',
            }],
        });
    });

    it('validates all compiler scene files through the CLI', async () => {
        const projectRoot = createCompilerSceneProject();
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'MainMenu.scene'), [
            '<Scene name="MainMenu">',
            '  <Button id="start" scene="src/scenes/Button.scene" />',
            '</Scene>',
            '',
        ].join('\n'), 'utf8');
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'MainMenu.ts'), [
            'import { Group } from "pixifact/runtime";',
            'import { scene } from "pixifact/scene";',
            '',
            '@scene()',
            'export class MainMenu extends Group {}',
            '',
        ].join('\n'), 'utf8');

        const result = await runCli([
            'scene',
            'validate',
            '--project-root',
            projectRoot,
            '--all',
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.json).toEqual({
            ok: true,
            projectRoot,
            sceneCount: 2,
        });
    });

    it('returns aggregated diagnostics when validating all compiler scenes fails', async () => {
        const projectRoot = createCompilerSceneProject();
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'Broken.scene'), [
            '<Scene name="Broken">',
            '  <Sprite id="icon" texture="assets/missing.png" />',
            '</Scene>',
            '',
        ].join('\n'), 'utf8');
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'Broken.ts'), [
            'import { Group } from "pixifact/runtime";',
            'import { scene } from "pixifact/scene";',
            '',
            '@scene()',
            'export class Broken extends Group {}',
            '',
        ].join('\n'), 'utf8');

        const result = await runCli([
            'scene',
            'validate',
            '--project-root',
            projectRoot,
            '--all',
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.json).toMatchObject({
            ok: false,
            projectRoot,
            sceneCount: 2,
            failures: [{
                scene: 'src/scenes/Broken.scene',
                error: 'Scene validation failed.',
                diagnostics: [{
                    path: '0:icon',
                    prop: 'texture',
                    expected: 'existing project asset',
                    actual: 'assets/missing.png',
                }],
            }],
        });
    });

    it('rejects invalid directly edited compiler scene files', async () => {
        const projectRoot = createCompilerSceneProject();
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'Button.scene'), [
            '<Scene name="Button">',
            '  <Sprite id="icon" textrue="assets/missing.png" />',
            '</Scene>',
            '',
        ].join('\n'), 'utf8');

        const result = await runCli([
            'scene',
            'validate',
            '--project-root',
            projectRoot,
            '--scene',
            'src/scenes/Button.scene',
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.json).toMatchObject({
            ok: false,
            scene: 'src/scenes/Button.scene',
            error: 'Scene validation failed.',
            diagnostics: [{
                path: '0:icon',
                prop: 'textrue',
                expected: 'known Sprite prop',
                actual: 'unknown prop',
            }],
        });
    });

    it('returns repairable diagnostics for malformed compiler scene files', async () => {
        const projectRoot = createCompilerSceneProject();
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'Button.scene'), [
            '<Scene name="Button">',
            '  <Text id="label" text="Start" ',
            '</Scene>',
            '',
        ].join('\n'), 'utf8');

        const result = await runCli([
            'scene',
            'validate',
            '--project-root',
            projectRoot,
            '--scene',
            'src/scenes/Button.scene',
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.json).toMatchObject({
            ok: false,
            scene: 'src/scenes/Button.scene',
            error: 'Scene parse failed.',
            diagnostics: [{
                path: '__scene__',
                prop: 'source',
                expected: 'valid Pixifact .scene source',
                actual: expect.stringContaining('Expected name at offset'),
                line: 3,
                column: 1,
            }],
            hint: 'Fix the listed diagnostics, then run scene validate again.',
        });
    });

    it('returns repairable diagnostics when compile-scenes rejects a scene', async () => {
        const projectRoot = createCompilerSceneProject();
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'Button.ts'), [
            'import { Group } from "pixifact/runtime";',
            'import { scene } from "pixifact/scene";',
            '',
            '@scene()',
            'export class PrimaryButton extends Group {}',
            '',
        ].join('\n'), 'utf8');

        const result = await runCli(['compile-scenes', '--project-root', projectRoot]);

        expect(result.exitCode).toBe(1);
        expect(result.json).toMatchObject({
            ok: false,
            scene: 'src/scenes/Button.scene',
            error: 'Scene compile failed.',
            diagnostics: [{
                path: '__scene__',
                prop: 'name',
                expected: 'paired @scene class name "PrimaryButton"',
                actual: 'Button',
                hint: 'Rename the <Scene name> to match the paired @scene class, or update the class name in the paired script.',
            }],
            hint: 'Fix the listed diagnostics, then run compile-scenes again.',
        });
    });

    it('returns repairable diagnostics when compile-scenes cannot parse a scene', async () => {
        const projectRoot = createCompilerSceneProject();
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'Button.scene'), [
            '<Scene name="Button">',
            '  <Text id="label" text="Start" ',
            '</Scene>',
            '',
        ].join('\n'), 'utf8');

        const result = await runCli(['compile-scenes', '--project-root', projectRoot]);

        expect(result.exitCode).toBe(1);
        expect(result.json).toMatchObject({
            ok: false,
            scene: 'src/scenes/Button.scene',
            error: 'Scene compile failed.',
            diagnostics: [{
                path: '__scene__',
                prop: 'source',
                expected: 'valid Pixifact .scene source',
                actual: expect.stringContaining('Expected name at offset'),
                line: 3,
                column: 1,
            }],
            hint: 'Fix the listed diagnostics, then run compile-scenes again.',
        });
    });

    it('rejects private compiler Scene instance props through the CLI', async () => {
        const projectRoot = createCompilerSceneProject();
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'Button.scene'), [
            '<Scene name="Button" />',
            '',
        ].join('\n'), 'utf8');
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'MainMenu.scene'), [
            '<Scene name="MainMenu">',
            '  <Button id="start" scene="src/scenes/Button.scene" label="Start" />',
            '</Scene>',
            '',
        ].join('\n'), 'utf8');
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'Button.ts'), [
            'import { Group } from "pixifact/runtime";',
            'import { prop, scene } from "pixifact/scene";',
            '',
            '@scene()',
            'export class Button extends Group {',
            '  @prop({ default: "Button" })',
            '  declare label: string;',
            '}',
            '',
        ].join('\n'), 'utf8');
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'MainMenu.ts'), [
            'import { Group } from "pixifact/runtime";',
            'import { scene } from "pixifact/scene";',
            '',
            '@scene()',
            'export class MainMenu extends Group {}',
            '',
        ].join('\n'), 'utf8');
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'MainMenu.scene'), [
            '<Scene name="MainMenu">',
            '  <Button id="start" scene="src/scenes/Button.scene" label="Start" secret="true" />',
            '</Scene>',
            '',
        ].join('\n'), 'utf8');

        const result = await runCli([
            'scene',
            'validate',
            '--project-root',
            projectRoot,
            '--scene',
            'src/scenes/MainMenu.scene',
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.json).toMatchObject({
            ok: false,
            error: 'Scene validation failed.',
            diagnostics: [{
                path: '0:start',
                prop: 'secret',
                expected: 'public prop declared by src/scenes/Button.scene',
                actual: 'unknown prop',
            }],
        });
    });

    it('rejects compiler scene validation outside source roots', async () => {
        const projectRoot = createCompilerSceneProject();
        fs.mkdirSync(path.join(projectRoot, 'scenes'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'scenes', 'Button.scene'), [
            '<Scene name="Button">',
            '</Scene>',
            '',
        ].join('\n'), 'utf8');
        fs.writeFileSync(path.join(projectRoot, 'scenes', 'Button.ts'), [
            'import { Group } from "pixifact/runtime";',
            'import { scene } from "pixifact/scene";',
            '',
            '@scene()',
            'export class Button extends Group {}',
            '',
        ].join('\n'), 'utf8');

        const result = await runCli([
            'scene',
            'validate',
            '--project-root',
            projectRoot,
            '--scene',
            'scenes/Button.scene',
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.json).toMatchObject({
            ok: false,
            scene: 'scenes/Button.scene',
            error: 'Scene validation failed.',
            diagnostics: [{
                path: '__scene__',
                prop: 'path',
                expected: 'Scene under source root "src/"',
                actual: 'scenes/Button.scene',
                hint: 'Move the .scene/.ts pair under src/ or configure an explicit Scene source root.',
            }],
        });
    });

    it('rejects bare child scene references', async () => {
        const projectRoot = createCompilerSceneProject();
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'Button.scene'), [
            '<Scene name="Button">',
            '  <Button id="child" scene="Button" />',
            '</Scene>',
            '',
        ].join('\n'), 'utf8');

        const result = await runCli([
            'scene',
            'validate',
            '--project-root',
            projectRoot,
            '--scene',
            'src/scenes/Button.scene',
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.json).toMatchObject({
            ok: false,
            scene: 'src/scenes/Button.scene',
            error: 'Scene validation failed.',
            diagnostics: [{
                path: '0:child',
                prop: 'scene',
                expected: 'project-relative or relative .scene path',
                actual: 'Button',
            }],
        });
    });

    it('rejects missing target paired script during compiler scene validation', async () => {
        const projectRoot = createCompilerSceneProject();
        fs.rmSync(path.join(projectRoot, 'src', 'scenes', 'Button.ts'));

        const result = await runCli([
            'scene',
            'validate',
            '--project-root',
            projectRoot,
            '--scene',
            'src/scenes/Button.scene',
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.json).toMatchObject({
            ok: false,
            scene: 'src/scenes/Button.scene',
            error: 'Scene validation failed.',
            diagnostics: [{
                path: '__scene__',
                prop: 'script',
                expected: 'paired script "src/scenes/Button.ts"',
                actual: 'missing script',
                hint: 'Create a colocated TypeScript file with the same basename as the .scene file.',
            }],
        });
    });

    it('rejects compiler scene basename mismatch during validation', async () => {
        const projectRoot = createCompilerSceneProject();
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'Button.scene'), [
            '<Scene name="PrimaryButton">',
            '  <Text id="label" text="Start" />',
            '</Scene>',
            '',
        ].join('\n'), 'utf8');

        const result = await runCli([
            'scene',
            'validate',
            '--project-root',
            projectRoot,
            '--scene',
            'src/scenes/Button.scene',
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.json).toMatchObject({
            ok: false,
            scene: 'src/scenes/Button.scene',
            error: 'Scene validation failed.',
            diagnostics: [{
                path: '__scene__',
                prop: 'name',
                expected: 'file basename "Button"',
                actual: 'PrimaryButton',
                hint: 'Rename the <Scene name> to match the .scene file basename, or rename the .scene/.ts pair.',
            }],
        });
    });

    it('rejects compiler scene class mismatch during validation', async () => {
        const projectRoot = createCompilerSceneProject();
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'Button.ts'), [
            'import { Group } from "pixifact/runtime";',
            'import { scene } from "pixifact/scene";',
            '',
            '@scene()',
            'export class PrimaryButton extends Group {}',
            '',
        ].join('\n'), 'utf8');

        const result = await runCli([
            'scene',
            'validate',
            '--project-root',
            projectRoot,
            '--scene',
            'src/scenes/Button.scene',
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.json).toMatchObject({
            ok: false,
            scene: 'src/scenes/Button.scene',
            error: 'Scene validation failed.',
            diagnostics: [{
                path: '__scene__',
                prop: 'name',
                expected: 'paired @scene class name "PrimaryButton"',
                actual: 'Button',
                hint: 'Rename the <Scene name> to match the paired @scene class, or update the class name in the paired script.',
            }],
        });
    });

    it('rejects paired script without @scene during compiler scene validation', async () => {
        const projectRoot = createCompilerSceneProject();
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'Button.ts'), [
            'import { Group } from "pixifact/runtime";',
            '',
            'export class Button extends Group {}',
            '',
        ].join('\n'), 'utf8');

        const result = await runCli([
            'scene',
            'validate',
            '--project-root',
            projectRoot,
            '--scene',
            'src/scenes/Button.scene',
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.json).toMatchObject({
            ok: false,
            scene: 'src/scenes/Button.scene',
            error: 'Scene validation failed.',
            diagnostics: [{
                path: '__scene__',
                prop: 'script',
                expected: 'paired script with one @scene class',
                actual: 'No @scene decorator found.',
                hint: 'Add a @scene() class to the paired TypeScript file and keep its class name aligned with the .scene basename.',
            }],
        });
    });

    it('rejects missing @part node ids during compiler scene validation', async () => {
        const projectRoot = createCompilerSceneProject();
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'Button.ts'), [
            'import { Text } from "pixi.js";',
            'import { Group } from "pixifact/runtime";',
            'import { part, scene } from "pixifact/scene";',
            '',
            '@scene()',
            'export class Button extends Group {',
            '  @part({ id: "missingLabel" })',
            '  protected declare label: Text;',
            '}',
            '',
        ].join('\n'), 'utf8');

        const result = await runCli([
            'scene',
            'validate',
            '--project-root',
            projectRoot,
            '--scene',
            'src/scenes/Button.scene',
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.json).toMatchObject({
            ok: false,
            scene: 'src/scenes/Button.scene',
            error: 'Scene validation failed.',
            diagnostics: [{
                path: '__scene__',
                prop: '@part label',
                expected: 'node id "missingLabel"',
                actual: 'missing node',
                hint: 'Add a node with this id to the .scene file or update @part({ id }).',
            }],
        });
    });

    it('validates compiler scene when unrelated malformed scene exists', async () => {
        const projectRoot = createCompilerSceneProject();
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'Other.scene'), [
            '<Scene name="Other">',
            '  <Text id="label" text="Broken" ',
            '</Scene>',
            '',
        ].join('\n'), 'utf8');

        const result = await runCli([
            'scene',
            'validate',
            '--project-root',
            projectRoot,
            '--scene',
            'src/scenes/Button.scene',
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.json).toMatchObject({
            ok: true,
            scenePath: 'src/scenes/Button.scene',
        });
    });

    it('rejects parent validation when child paired script contract is invalid', async () => {
        const projectRoot = createCompilerSceneProject();
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'Button.scene'), [
            '<Scene name="Button" />',
            '',
        ].join('\n'), 'utf8');
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'Button.ts'), [
            'import { Group } from "pixifact/runtime";',
            'import { prop, scene } from "pixifact/scene";',
            '',
            '@scene()',
            'export class PrimaryButton extends Group {',
            '  @prop({ default: "Button" })',
            '  declare label: string;',
            '}',
            '',
        ].join('\n'), 'utf8');
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'MainMenu.scene'), [
            '<Scene name="MainMenu">',
            '  <Button id="start" scene="src/scenes/Button.scene" label="Start" />',
            '</Scene>',
            '',
        ].join('\n'), 'utf8');
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'MainMenu.ts'), [
            'import { Group } from "pixifact/runtime";',
            'import { scene } from "pixifact/scene";',
            '',
            '@scene()',
            'export class MainMenu extends Group {}',
            '',
        ].join('\n'), 'utf8');

        const result = await runCli([
            'scene',
            'validate',
            '--project-root',
            projectRoot,
            '--scene',
            'src/scenes/MainMenu.scene',
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.json).toMatchObject({
            ok: false,
            scene: 'src/scenes/MainMenu.scene',
            error: 'Scene validation failed.',
            diagnostics: [{
                path: '0:start',
                prop: 'scene',
                expected: 'known compiler Scene contract',
                actual: 'src/scenes/Button.scene',
            }],
        });
    });

    it('maps compile-scenes missing @part node ids to repairable diagnostics', async () => {
        const projectRoot = createCompilerSceneProject();
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'Button.ts'), [
            'import { Text } from "pixi.js";',
            'import { Group } from "pixifact/runtime";',
            'import { part, scene } from "pixifact/scene";',
            '',
            '@scene()',
            'export class Button extends Group {',
            '  @part({ id: "missingLabel" })',
            '  protected declare label: Text;',
            '}',
            '',
        ].join('\n'), 'utf8');

        const result = await runCli(['compile-scenes', '--project-root', projectRoot]);

        expect(result.exitCode).toBe(1);
        expect(result.json).toMatchObject({
            ok: false,
            scene: 'src/scenes/Button.scene',
            error: 'Scene compile failed.',
            diagnostics: [{
                path: '__scene__',
                prop: '@part label',
                expected: 'node id "missingLabel"',
                actual: 'missing node',
                hint: 'Add a node with this id to the .scene file or update @part({ id }).',
            }],
            hint: 'Fix the listed diagnostics, then run compile-scenes again.',
        });
    });

    it('maps compile-scenes basename mismatch to repairable diagnostics', async () => {
        const projectRoot = createCompilerSceneProject();
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'Button.scene'), [
            '<Scene name="PrimaryButton">',
            '  <Text id="label" text="Start" />',
            '</Scene>',
            '',
        ].join('\n'), 'utf8');
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'Button.ts'), [
            'import { Group } from "pixifact/runtime";',
            'import { scene } from "pixifact/scene";',
            '',
            '@scene()',
            'export class PrimaryButton extends Group {}',
            '',
        ].join('\n'), 'utf8');

        const result = await runCli(['compile-scenes', '--project-root', projectRoot]);

        expect(result.exitCode).toBe(1);
        expect(result.json).toMatchObject({
            ok: false,
            scene: 'src/scenes/Button.scene',
            error: 'Scene compile failed.',
            diagnostics: [{
                path: '__scene__',
                prop: 'name',
                expected: 'file basename "Button"',
                actual: 'PrimaryButton',
                hint: 'Rename the <Scene name> to match the .scene file basename, or rename the .scene/.ts pair.',
            }],
            hint: 'Fix the listed diagnostics, then run compile-scenes again.',
        });
    });

    it('does not overwrite an existing Scene file', async () => {
        const projectRoot = createTempProject();

        const result = await runCli([
            'scene',
            'create',
            '--project-root',
            projectRoot,
            '--scene',
            'src/scenes/Button.scene',
            '--name',
            'Existing',
        ]);
        const saved = fs.readFileSync(path.join(projectRoot, 'src/scenes/Button.scene'), 'utf8');

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.json).toMatchObject({
            ok: false,
            error: 'Scene file already exists.',
        });
        expect(result.json.hint).toContain('different scene path');
        expect(saved).toContain('<Scene name="Button">');
    });

    it('rejects Scene creation outside the project root', async () => {
        const projectRoot = createTempProject();

        const result = await runCli([
            'scene',
            'create',
            '--project-root',
            projectRoot,
            '--scene',
            '../Login.scene',
            '--name',
            'Login',
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.json).toMatchObject({
            ok: false,
        });
        expect(result.json.error).toContain('inside projectRoot');
        expect(result.json.hint).toContain('project-relative');
        expect(fs.existsSync(path.resolve(projectRoot, '../Login.scene'))).toBe(false);
    });

    it('rejects file paths outside the project root', async () => {
        const projectRoot = createTempProject();

        const result = await runCli([
            'scene',
            'inspect',
            '--project-root',
            projectRoot,
            '--scene',
            '../outside.scene',
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.json).toMatchObject({
            ok: false,
        });
        expect(result.json.error).toContain('inside projectRoot');
        expect(result.json.hint).toContain('project-relative');
    });

    it('does not expose retired live commands', async () => {
        const result = await runCli(['live', 'summary']);

        expect(result.exitCode).toBe(1);
        expect(result.json).toMatchObject({
            ok: false,
            error: 'Unknown Pixifact CLI command "live summary".',
        });
    });
});
