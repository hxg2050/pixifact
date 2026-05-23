import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { container, scene, text } from 'pixifact';
import type { SceneCommand } from 'pixifact';
import { executePixifactCli } from '../packages/pixifact-cli/src/pixifact-cli';
import {
    getSceneDocument,
    resetSceneDocument,
} from '../apps/editor/src/document/sceneDocumentController';
import { useEditorStore } from '../apps/editor/src/editorStore';
import { createLiveEditorActionHandlers } from '../apps/editor/src/agent/liveEditorClient';

const tempRoots: string[] = [];

const host = vi.hoisted(() => {
    function hostTree() {
        return {
            id: 'GameProject',
            name: 'GameProject',
            path: 'GameProject',
            kind: 'folder',
            depth: 0,
            systemPath: '/tmp/GameProject',
            children: [{
                id: 'GameProject/scenes',
                name: 'scenes',
                path: 'GameProject/scenes',
                kind: 'folder',
                depth: 1,
                systemPath: '/tmp/GameProject/scenes',
                children: [
                    {
                        id: 'GameProject/scenes/Menu.scene',
                        name: 'Menu.scene',
                        path: 'GameProject/scenes/Menu.scene',
                        kind: 'scene',
                        depth: 2,
                        systemPath: '/tmp/GameProject/scenes/Menu.scene',
                    },
                    {
                        id: 'GameProject/scenes/Other.scene',
                        name: 'Other.scene',
                        path: 'GameProject/scenes/Other.scene',
                        kind: 'scene',
                        depth: 2,
                        systemPath: '/tmp/GameProject/scenes/Other.scene',
                    },
                ],
            }],
        };
    }

    return {
        hostTree,
        readHostProjectFileTree: vi.fn(async () => hostTree()),
        writeHostProjectFileText: vi.fn(async () => {}),
    };
});

vi.mock('../apps/editor/src/services/hostBridge', () => ({
    createHostProjectDirectory: vi.fn(),
    createHostProjectFile: vi.fn(),
    deleteHostProjectEntry: vi.fn(),
    openHostCodeFile: vi.fn(),
    openHostDefaultFile: vi.fn(),
    pickHostProjectFolder: vi.fn(),
    readHostProjectFileBytes: vi.fn(),
    readHostProjectFileText: vi.fn(),
    readHostProjectFileTree: host.readHostProjectFileTree,
    renameHostProjectEntry: vi.fn(),
    writeHostProjectFileText: host.writeHostProjectFileText,
}));

function createTempProject() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pixifact-cli-'));
    tempRoots.push(root);
    const scene = {
        version: 1,
        type: 'scene',
        name: 'CLI Button',
        root: {
            kind: 'container',
            id: 'root',
            key: 'root',
            name: 'Root',
            transform: {
                width: 320,
                height: 180,
            },
            children: [{
                kind: 'text',
                id: 'label-node',
                key: 'label',
                name: 'Label',
                text: {
                    value: 'Start',
                    color: 0xffffff,
                    fontSize: 14,
                    center: true,
                },
            }],
        },
    };
    fs.writeFileSync(path.join(root, 'button.scene'), `${JSON.stringify(scene, null, 2)}\n`, 'utf8');
    return root;
}

function createEmptyTempProject() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pixifact-cli-'));
    tempRoots.push(root);
    fs.mkdirSync(path.join(root, 'scenes'), { recursive: true });
    fs.mkdirSync(path.join(root, 'commands'), { recursive: true });
    return root;
}

function writeCommands(root: string, commands: unknown) {
    const commandsPath = path.join(root, 'commands.json');
    fs.writeFileSync(commandsPath, JSON.stringify(commands), 'utf8');
    return commandsPath;
}

async function runCli(argv: string[], input?: string) {
    const result = await executePixifactCli(argv, { input });
    return {
        ...result,
        json: JSON.parse(result.stdout || result.stderr),
    };
}

function liveProjectTree() {
    const tree = host.hostTree();
    return {
        ...tree,
        projectRootPath: '/tmp/GameProject',
        children: tree.children?.map((folder) => ({
            ...folder,
            projectRootPath: '/tmp/GameProject',
            children: folder.children?.map((file) => ({
                ...file,
                projectRootPath: '/tmp/GameProject',
            })),
        })),
    };
}

function openLiveMenuScene() {
    resetSceneDocument();
    const document = getSceneDocument();
    document.load(scene('Menu',
        container('Root', {
            id: 'root',
            key: 'root',
            children: [
                text('Label', {
                    key: 'menuLabel',
                    value: 'Start',
                    color: 0xffffff,
                    fontSize: 14,
                }),
            ],
        }),
    ));
    document.setSelection({ type: 'node', node: 'menuLabel' });
    document.dirty = false;
    useEditorStore.setState({
        projectName: 'GameProject',
        projectTree: liveProjectTree(),
        selectedProjectFilePath: 'GameProject/scenes/Menu.scene',
        openedScenePath: 'GameProject/scenes/Menu.scene',
        expandedProjectFolders: ['GameProject', 'GameProject/scenes'],
        expandedHierarchyNodesByScene: {},
        prompt: '创建一个背包界面，四列三行，每个格子有图标、数量和 Use 按钮。',
        language: 'zh-CN',
    });
    return document;
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

    it('outputs a project summary as JSON', async () => {
        const projectRoot = createTempProject();
        const result = await runCli(['summary', '--project-root', projectRoot]);

        expect(result.exitCode).toBe(0);
        expect(result.json.scenes).toContain('button.scene');
    });

    it('includes pixifact project run config in summary without running it', async () => {
        const projectRoot = createTempProject();
        fs.writeFileSync(path.join(projectRoot, 'pixifact.project.json'), JSON.stringify({
            version: 1,
            name: 'Space HUD Game',
            scenes: {
                hud: 'button.scene',
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
            scenes: {
                hud: 'button.scene',
            },
            run: {
                command: 'bun',
                args: ['run', 'dev'],
                cwd: '.',
                url: 'http://localhost:5173',
            },
        });
    });

    it('creates a new Scene file with a container root', async () => {
        const projectRoot = createTempProject();
        fs.mkdirSync(path.join(projectRoot, 'scenes'));

        const result = await runCli([
            'scene',
            'create',
            '--project-root',
            projectRoot,
            '--scene',
            'scenes/Login.scene',
            '--name',
            'Login',
        ]);
        const saved = JSON.parse(fs.readFileSync(path.join(projectRoot, 'scenes/Login.scene'), 'utf8'));

        expect(result.exitCode).toBe(0);
        expect(result.json).toMatchObject({
            ok: true,
            scenePath: 'scenes/Login.scene',
            summary: {
                name: 'Login',
                nodeCount: 1,
            },
        });
        expect(saved).toMatchObject({
            version: 1,
            type: 'scene',
            name: 'Login',
            root: {
                kind: 'container',
                id: 'root',
                key: 'root',
                name: 'Root',
                children: [],
            },
        });
    });

    it('compiles Pixifact scene templates through the CLI', async () => {
        const projectRoot = createEmptyTempProject();
        fs.mkdirSync(path.join(projectRoot, 'src', 'scenes'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'scenes', 'Button.scene'), `
            <Scene name="Button" script="../src/scenes/Button.ts" class="Button" width="120" height="40">
              <Text id="labelText" text="Button" />
            </Scene>
        `);
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'Button.ts'), `
            import { Container, Text } from 'pixi.js';
            import { part, prop, scene } from 'pixifact/compiler';

            @scene('./scenes/Button.scene')
            export class Button extends Container {
                @part()
                protected declare labelText: Text;

                @prop({ type: 'string', default: 'Button' })
                accessor label = 'Button';
            }
        `);

        const result = await runCli(['compile-scenes', '--project-root', projectRoot]);
        const generated = fs.readFileSync(path.join(projectRoot, 'src', 'generated', 'Button.scene.generated.ts'), 'utf8');
        const descriptor = JSON.parse(fs.readFileSync(path.join(projectRoot, 'src', 'generated', 'Button.scene.interface.json'), 'utf8'));

        expect(result.exitCode).toBe(0);
        expect(result.json).toMatchObject({
            ok: true,
            projectRoot,
        });
        expect(generated).toContain('export function mountButtonScene(root: Container)');
        expect(descriptor).toMatchObject({
            scene: './scenes/Button.scene',
            className: 'Button',
            interface: {
                props: {
                    label: {
                        type: 'string',
                        default: 'Button',
                    },
                },
            },
            parts: {
                labelText: 'labelText',
            },
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
            'button.scene',
            '--name',
            'Existing',
        ]);
        const saved = JSON.parse(fs.readFileSync(path.join(projectRoot, 'button.scene'), 'utf8'));

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.json).toMatchObject({
            ok: false,
            error: 'Scene file already exists.',
        });
        expect(result.json.hint).toContain('different scene path');
        expect(saved.name).toBe('CLI Button');
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

    it('dry-runs commands without writing the Scene file', async () => {
        const projectRoot = createTempProject();
        const command = {
            op: 'setNodeData',
            node: 'label',
            field: 'text',
            prop: 'value',
            value: 'Continue',
        };
        const commandsPath = writeCommands(projectRoot, [command]);

        const result = await runCli([
            'commands',
            'dry-run',
            '--project-root',
            projectRoot,
            '--scene',
            'button.scene',
            '--commands',
            commandsPath,
        ]);
        const saved = JSON.parse(fs.readFileSync(path.join(projectRoot, 'button.scene'), 'utf8'));

        expect(result.exitCode).toBe(0);
        expect(result.json.ok).toBe(true);
        expect(result.json.diffs[0]).toMatchObject({
            target: 'label.text.value',
            before: 'Start',
            after: 'Continue',
        });
        expect(saved.root.children[0].text.value).toBe('Start');
    });

    it('applies commands after dry-run and saves the Scene file', async () => {
        const projectRoot = createTempProject();
        const command = {
            op: 'setNodeData',
            node: 'label',
            field: 'text',
            prop: 'value',
            value: 'Continue',
        };
        const commandsPath = writeCommands(projectRoot, [command]);

        const result = await runCli([
            'commands',
            'apply',
            '--project-root',
            projectRoot,
            '--scene',
            'button.scene',
            '--commands',
            commandsPath,
        ]);
        const saved = JSON.parse(fs.readFileSync(path.join(projectRoot, 'button.scene'), 'utf8'));

        expect(result.exitCode).toBe(0);
        expect(result.json.ok).toBe(true);
        expect(saved.root.children[0].text.value).toBe('Continue');
    });

    it('dry-runs template add without writing the Scene file', async () => {
        const projectRoot = createTempProject();

        const result = await runCli([
            'template',
            'add',
            'dry-run',
            '--project-root',
            projectRoot,
            '--scene',
            'button.scene',
            '--kind',
            'loginForm',
            '--parent',
            'root',
            '--key',
            'login',
        ]);
        const saved = JSON.parse(fs.readFileSync(path.join(projectRoot, 'button.scene'), 'utf8'));

        expect(result.exitCode).toBe(0);
        expect(result.json.ok).toBe(true);
        expect(result.json.commands[0]).toMatchObject({
            op: 'createNode',
            parent: 'root',
            node: {
                key: 'login',
                role: 'login-form',
                kind: 'container',
            },
        });
        expect(result.json.scene.root.children.some((node: { key?: string }) => node.key === 'login')).toBe(true);
        expect(saved.root.children.some((node: { key?: string }) => node.key === 'login')).toBe(false);
    });

    it('applies template add after dry-run and saves the Scene file', async () => {
        const projectRoot = createTempProject();

        const result = await runCli([
            'template',
            'add',
            'apply',
            '--project-root',
            projectRoot,
            '--scene',
            'button.scene',
            '--kind',
            'button',
            '--parent',
            'root',
            '--key',
            'submit',
            '--label',
            '登录',
        ]);
        const saved = JSON.parse(fs.readFileSync(path.join(projectRoot, 'button.scene'), 'utf8'));
        const button = saved.root.children.find((node: { key?: string }) => node.key === 'submit');

        expect(result.exitCode).toBe(0);
        expect(result.json.ok).toBe(true);
        expect(result.json.commands[0]).toMatchObject({
            op: 'createNode',
            parent: 'root',
            node: {
                key: 'submit',
                role: 'button',
                kind: 'container',
            },
        });
        expect(button.components[0]).toMatchObject({
            id: 'submitButton',
            type: 'ui.Button',
        });
        expect(button.children.find((node: { key?: string }) => node.key === 'submitLabel').text.value).toBe('登录');
    });

    it('applies input templates in file mode without a DOM document', async () => {
        const projectRoot = createTempProject();
        const originalDocument = globalThis.document;
        vi.stubGlobal('document', undefined);

        const result = await runCli([
            'template',
            'add',
            'apply',
            '--project-root',
            projectRoot,
            '--scene',
            'button.scene',
            '--kind',
            'loginForm',
            '--parent',
            'root',
            '--key',
            'login',
        ]).finally(() => {
            vi.stubGlobal('document', originalDocument);
        });
        const saved = JSON.parse(fs.readFileSync(path.join(projectRoot, 'button.scene'), 'utf8'));
        const form = saved.root.children.find((node: { key?: string }) => node.key === 'login');

        expect(result.exitCode).toBe(0);
        expect(result.json.ok).toBe(true);
        expect(form.kind).toBe('container');
        expect(form.children.some((node: { kind?: string; key?: string }) => node.kind === 'input' && node.key === 'loginUsername')).toBe(true);
    });

    it('recreates the basic game sample through the file-mode CLI workflow', async () => {
        const projectRoot = createEmptyTempProject();
        const commandsPath = path.join(projectRoot, 'commands/setup-main-scene.json');
        fs.copyFileSync(path.resolve('sample-projects/basic-game/commands/setup-main-scene.json'), commandsPath);

        const createResult = await runCli([
            'scene',
            'create',
            '--project-root',
            projectRoot,
            '--scene',
            'scenes/Main.scene',
            '--name',
            'BasicGame',
        ]);
        const templateResult = await runCli([
            'template',
            'add',
            'apply',
            '--project-root',
            projectRoot,
            '--scene',
            'scenes/Main.scene',
            '--kind',
            'loginForm',
            '--parent',
            'root',
            '--key',
            'login',
            '--label',
            '开始游戏',
        ]);
        const dryRunResult = await runCli([
            'commands',
            'dry-run',
            '--project-root',
            projectRoot,
            '--scene',
            'scenes/Main.scene',
            '--commands',
            commandsPath,
        ]);
        const applyResult = await runCli([
            'commands',
            'apply',
            '--project-root',
            projectRoot,
            '--scene',
            'scenes/Main.scene',
            '--commands',
            commandsPath,
        ]);
        const expected = JSON.parse(fs.readFileSync(path.resolve('sample-projects/basic-game/scenes/Main.scene'), 'utf8'));
        const saved = JSON.parse(fs.readFileSync(path.join(projectRoot, 'scenes/Main.scene'), 'utf8'));

        expect(createResult.exitCode).toBe(0);
        expect(templateResult.exitCode).toBe(0);
        expect(dryRunResult.exitCode).toBe(0);
        expect(applyResult.exitCode).toBe(0);
        expect(dryRunResult.json.scene).toEqual(expected);
        expect(saved).toEqual(expected);
        expect(applyResult.json.summary).toMatchObject({
            name: 'BasicGame',
            nodeCount: 15,
            componentCount: 2,
        });
    });

    it('rejects unknown template kinds with structured error JSON', async () => {
        const projectRoot = createTempProject();

        const result = await runCli([
            'template',
            'add',
            'dry-run',
            '--project-root',
            projectRoot,
            '--scene',
            'button.scene',
            '--kind',
            'unknown',
            '--parent',
            'root',
            '--key',
            'unknown',
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.json).toMatchObject({
            ok: false,
            error: 'Unknown template kind "unknown".',
        });
        expect(result.json.hint).toContain('button, progressBar, scrollView, loginForm');
    });

    it('reads commands from stdin', async () => {
        const projectRoot = createTempProject();
        const command = {
            op: 'setNodeData',
            node: 'label',
            field: 'text',
            prop: 'value',
            value: 'Continue',
        };

        const result = await runCli([
            'commands',
            'validate',
            '--project-root',
            projectRoot,
            '--scene',
            'button.scene',
            '--commands',
            '-',
        ], JSON.stringify([command]));

        expect(result.exitCode).toBe(0);
        expect(result.json.ok).toBe(true);
    });

    it('returns structured command metadata when dry-run fails', async () => {
        const projectRoot = createTempProject();
        const command = {
            op: 'setNodeData',
            node: 'missingLabel',
            field: 'text',
            prop: 'value',
            value: 'Continue',
        };
        const commandsPath = writeCommands(projectRoot, [command]);

        const result = await runCli([
            'commands',
            'dry-run',
            '--project-root',
            projectRoot,
            '--scene',
            'button.scene',
            '--commands',
            commandsPath,
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.json).toMatchObject({
            ok: false,
            error: 'Node "missingLabel" was not found.',
            commandIndex: 0,
            op: 'setNodeData',
            node: 'missingLabel',
            target: 'missingLabel.text.value',
        });
        expect(result.json.hint).toContain('node inspect');
    });

    it('returns structured command metadata when validate fails under a leaf node', async () => {
        const projectRoot = createTempProject();
        const command = {
            op: 'createNode',
            parent: 'label',
            node: {
                kind: 'text',
                key: 'childLabel',
                name: 'Child',
                text: {
                    value: 'Child',
                },
            },
        };
        const commandsPath = writeCommands(projectRoot, [command]);

        const result = await runCli([
            'commands',
            'validate',
            '--project-root',
            projectRoot,
            '--scene',
            'button.scene',
            '--commands',
            commandsPath,
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.json).toMatchObject({
            ok: false,
            error: 'Only container nodes can contain child nodes.',
            commandIndex: 0,
            op: 'createNode',
            node: 'childLabel',
            target: 'label.children',
        });
        expect(result.json.hint).toContain('container');
    });

    it('returns structured command metadata when apply dry-run rejects an invalid field', async () => {
        const projectRoot = createTempProject();
        const command = {
            op: 'setNodeData',
            node: 'label',
            field: 'text',
            prop: 'missingProp',
            value: 'Continue',
        };
        const commandsPath = writeCommands(projectRoot, [command]);

        const result = await runCli([
            'commands',
            'apply',
            '--project-root',
            projectRoot,
            '--scene',
            'button.scene',
            '--commands',
            commandsPath,
        ]);
        const saved = JSON.parse(fs.readFileSync(path.join(projectRoot, 'button.scene'), 'utf8'));

        expect(result.exitCode).toBe(1);
        expect(result.json).toMatchObject({
            ok: false,
            error: 'Node data prop "missingProp" does not exist on text.',
            commandIndex: 0,
            op: 'setNodeData',
            node: 'label',
            target: 'label.text.missingProp',
        });
        expect(result.json.hint).toContain('field belongs');
        expect(saved.root.children[0].text.value).toBe('Start');
    });

    it('rejects file paths outside the project root', async () => {
        const projectRoot = createTempProject();

        const result = await runCli([
            'scene',
            'get',
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

    it('routes live commands to the live editor bridge when connected', async () => {
        const result = await executePixifactCli([
            'live',
            'scene',
            'get',
        ], {
            liveBridge: {
                connected: true,
                stop: () => {},
                callAction: async (action, args) => ({
                    live: true,
                    action,
                    args,
                }),
            },
        });
        const parsed = JSON.parse(result.stdout);

        expect(result.exitCode).toBe(0);
        expect(parsed).toMatchObject({
            live: true,
            action: 'scene.get',
            args: {},
        });
    });

    it('applies live editor commands to the current SceneDocument and saves the opened Scene', async () => {
        const document = openLiveMenuScene();
        const handlers = createLiveEditorActionHandlers();
        const command: SceneCommand = {
            op: 'setNodeData',
            node: 'menuLabel',
            field: 'text',
            prop: 'value',
            value: 'Continue',
        };
        const result = await handlers['commands.apply']({
            commands: [command],
        });
        const savedContent = host.writeHostProjectFileText.mock.calls[0]?.[2] as string;

        expect(result).toMatchObject({
            ok: true,
            live: true,
            saved: true,
            scenePath: 'GameProject/scenes/Menu.scene',
        });
        expect(document.scene.root.children?.[0].text?.value).toBe('Continue');
        expect(document.dirty).toBe(false);
        expect((document.preview?.components.get('menuLabel') as { text?: string } | undefined)?.text).toBe('Continue');
        expect(host.writeHostProjectFileText).toHaveBeenCalledWith(
            '/tmp/GameProject',
            'GameProject/scenes/Menu.scene',
            expect.any(String),
        );
        expect(JSON.parse(savedContent).root.children[0].text.value).toBe('Continue');
        expect(host.writeHostProjectFileText.mock.calls.some((call) => call[1] === 'GameProject/scenes/Other.scene')).toBe(false);
    });

    it('dry-runs live template add without changing the current SceneDocument', async () => {
        const document = openLiveMenuScene();
        const handlers = createLiveEditorActionHandlers();

        const result = await handlers['template.add.dryRun']({
            kind: 'loginForm',
            parent: 'root',
            key: 'login',
        });

        expect(result).toMatchObject({
            ok: true,
            live: true,
            commands: [{
                op: 'createNode',
                parent: 'root',
                node: {
                    key: 'login',
                    role: 'login-form',
                },
            }],
        });
        expect(result.scene.root.children.some((node: { key?: string }) => node.key === 'login')).toBe(true);
        expect(document.scene.root.children?.some((node) => node.key === 'login')).toBe(false);
    });

    it('applies live template add to the current SceneDocument and saves the opened Scene', async () => {
        const document = openLiveMenuScene();
        const handlers = createLiveEditorActionHandlers();

        const result = await handlers['template.add.apply']({
            kind: 'button',
            parent: 'root',
            key: 'submit',
            label: '登录',
        });
        const savedContent = host.writeHostProjectFileText.mock.calls[0]?.[2] as string;
        const button = document.scene.root.children?.find((node) => node.key === 'submit');

        expect(result).toMatchObject({
            ok: true,
            live: true,
            saved: true,
            commands: [{
                op: 'createNode',
                parent: 'root',
                node: {
                    key: 'submit',
                    role: 'button',
                },
            }],
        });
        expect(button?.kind).toBe('container');
        expect(button?.components?.[0].type).toBe('ui.Button');
        expect(button?.children?.find((node) => node.key === 'submitLabel')?.text?.value).toBe('登录');
        expect(JSON.parse(savedContent).root.children.some((node: { key?: string }) => node.key === 'submit')).toBe(true);
    });

    it('routes live template add through the live editor bridge', async () => {
        const result = await executePixifactCli([
            'live',
            'template',
            'add',
            'dry-run',
            '--kind',
            'loginForm',
            '--parent',
            'root',
            '--key',
            'login',
        ], {
            liveBridge: {
                connected: true,
                stop: () => {},
                callAction: async (action, args) => ({
                    ok: true,
                    live: true,
                    action,
                    args,
                }),
            },
        });
        const parsed = JSON.parse(result.stdout);

        expect(result.exitCode).toBe(0);
        expect(parsed).toMatchObject({
            ok: true,
            live: true,
            action: 'template.add.dryRun',
            args: {
                kind: 'loginForm',
                parent: 'root',
                key: 'login',
            },
        });
    });

    it('returns structured command metadata when live dry-run fails', async () => {
        openLiveMenuScene();
        const handlers = createLiveEditorActionHandlers();
        const command: SceneCommand = {
            op: 'setNodeData',
            node: 'missingLabel',
            field: 'text',
            prop: 'value',
            value: 'Continue',
        };

        const result = await handlers['commands.dryRun']({
            commands: [command],
        });

        expect(result).toMatchObject({
            ok: false,
            live: true,
            error: 'Node "missingLabel" was not found.',
            commandIndex: 0,
            op: 'setNodeData',
            node: 'missingLabel',
            target: 'missingLabel.text.value',
        });
        expect(result.hint).toContain('node inspect');
    });

    it('returns structured command metadata when live validate fails under a leaf node', async () => {
        openLiveMenuScene();
        const handlers = createLiveEditorActionHandlers();
        const command: SceneCommand = {
            op: 'createNode',
            parent: 'menuLabel',
            node: text('Child', {
                key: 'childLabel',
                value: 'Child',
            }),
        };

        const result = await handlers['commands.validate']({
            commands: [command],
        });

        expect(result).toMatchObject({
            ok: false,
            live: true,
            error: 'Only container nodes can contain child nodes.',
            commandIndex: 0,
            op: 'createNode',
            node: 'childLabel',
            target: 'menuLabel.children',
        });
        expect(result.hint).toContain('container');
    });

    it('returns non-zero CLI result when live apply fails validation', async () => {
        const command: SceneCommand = {
            op: 'setNodeData',
            node: 'menuLabel',
            field: 'text',
            prop: 'missingProp',
            value: 'Continue',
        };
        const result = await executePixifactCli([
            'live',
            'commands',
            'apply',
            '--commands',
            '-',
        ], {
            input: JSON.stringify([command]),
            liveBridge: {
                connected: true,
                stop: () => {},
                callAction: async () => ({
                    ok: false,
                    live: true,
                    error: 'Node data prop "missingProp" does not exist on text.',
                    commandIndex: 0,
                    op: 'setNodeData',
                    node: 'menuLabel',
                    target: 'menuLabel.text.missingProp',
                    hint: 'Verify that the field belongs to the target node or component schema before retrying.',
                }),
            },
        });
        const parsed = JSON.parse(result.stderr);

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe('');
        expect(parsed).toMatchObject({
            ok: false,
            live: true,
            commandIndex: 0,
            op: 'setNodeData',
            node: 'menuLabel',
            target: 'menuLabel.text.missingProp',
        });
        expect(parsed.hint).toContain('field belongs');
    });
});
