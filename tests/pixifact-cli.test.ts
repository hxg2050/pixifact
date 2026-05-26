import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { container, scene, text } from 'pixifact';
import { createSceneRevision, parseSceneTemplate } from 'pixifact/compiler';
import { executePixifactCli } from '../packages/pixifact-cli/src/pixifact-cli';
import {
    getSceneDocument,
    resetSceneDocument,
} from '../apps/editor/src/document/sceneDocumentController';
import {
    loadCompilerSceneDocument,
    resetCompilerSceneDocument,
    selectCompilerSceneNode,
} from '../apps/editor/src/document/compilerSceneDocumentController';
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
    watchHostProjectFiles: vi.fn(),
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
    return root;
}

function createCompilerSceneProject() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pixifact-compiler-cli-'));
    tempRoots.push(root);
    fs.mkdirSync(path.join(root, 'scenes'), { recursive: true });
    fs.writeFileSync(path.join(root, 'scenes', 'Button.scene'), [
        '<Scene name="Button" script="src/scenes/Button.ts">',
        '  <Text id="label" text="Start" />',
        '</Scene>',
        '',
    ].join('\n'), 'utf8');
    return root;
}

function writeSceneProposal(root: string, proposal: unknown) {
    const proposalPath = path.join(root, 'proposal.json');
    fs.writeFileSync(proposalPath, JSON.stringify(proposal), 'utf8');
    return proposalPath;
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
    resetCompilerSceneDocument();
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
        language: 'zh-CN',
    });
    return document;
}

function openLiveCompilerScene() {
    resetSceneDocument();
    resetCompilerSceneDocument();
    const template = parseSceneTemplate([
        '<Scene name="Menu" script="src/scenes/Menu.ts">',
        '  <Container id="content">',
        '    <Text id="menuLabel" text="Start" />',
        '  </Container>',
        '</Scene>',
        '',
    ].join('\n'));
    loadCompilerSceneDocument({
        scenePath: 'GameProject/scenes/Menu.scene',
        template,
        sceneInterfaces: {},
    });
    selectCompilerSceneNode('0:content/0:menuLabel');
    useEditorStore.setState({
        projectName: 'GameProject',
        projectTree: liveProjectTree(),
        selectedProjectFilePath: 'GameProject/scenes/Menu.scene',
        openedScenePath: 'GameProject/scenes/Menu.scene',
        expandedProjectFolders: ['GameProject', 'GameProject/scenes'],
        expandedHierarchyNodesByScene: {},
        language: 'zh-CN',
    });
}

afterEach(() => {
    resetCompilerSceneDocument();
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
            <Scene name="Button" script="src/scenes/Button.ts" width="120" height="40">
              <Text id="labelText" text="Button" />
            </Scene>
        `);
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'Button.ts'), `
            import { Container, Text } from 'pixi.js';
            import { part, prop, scene } from 'pixifact/compiler';

            @scene()
            export class Button extends Container {
                @part()
                protected declare labelText: Text;

                @prop({ type: 'string', default: 'Button' })
                accessor label = 'Button';
            }
        `);

        const result = await runCli(['compile-scenes', '--project-root', projectRoot]);
        const generated = fs.readFileSync(path.join(projectRoot, '.pixifact', 'generated', 'Button.scene.generated.ts'), 'utf8');

        expect(result.exitCode).toBe(0);
        expect(result.json).toMatchObject({
            ok: true,
            projectRoot,
        });
        expect(generated).toContain('export function mountButtonScene(root: Container)');
        expect(generated).toContain('registerSceneClass(Button, "scenes/Button.scene");');
    });

    it('inspects compiler scene files for external agents', async () => {
        const projectRoot = createCompilerSceneProject();

        const result = await runCli([
            'scene',
            'inspect',
            '--project-root',
            projectRoot,
            '--scene',
            'scenes/Button.scene',
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.json).toMatchObject({
            ok: true,
            scenePath: 'scenes/Button.scene',
            revision: createSceneRevision(fs.readFileSync(path.join(projectRoot, 'scenes', 'Button.scene'), 'utf8')),
            summary: {
                name: 'Button',
                script: 'src/scenes/Button.ts',
                nodeCount: 1,
            },
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
            'scenes/Button.scene',
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.json).toMatchObject({
            ok: true,
            scenePath: 'scenes/Button.scene',
            revision: createSceneRevision(fs.readFileSync(path.join(projectRoot, 'scenes', 'Button.scene'), 'utf8')),
            summary: {
                name: 'Button',
                script: 'src/scenes/Button.ts',
                nodeCount: 1,
            },
        });
    });

    it('rejects invalid directly edited compiler scene files', async () => {
        const projectRoot = createCompilerSceneProject();
        fs.writeFileSync(path.join(projectRoot, 'scenes', 'Button.scene'), [
            '<Scene name="Button" script="src/scenes/Button.ts">',
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
            'scenes/Button.scene',
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.json).toMatchObject({
            ok: false,
            scene: 'scenes/Button.scene',
            error: 'Scene validation failed.',
            diagnostics: [{
                path: '0:icon',
                prop: 'textrue',
                expected: 'known Sprite prop',
                actual: 'unknown prop',
            }],
        });
    });

    it('checks compiler scene proposals without writing files', async () => {
        const projectRoot = createCompilerSceneProject();
        const scenePath = path.join(projectRoot, 'scenes', 'Button.scene');
        const current = fs.readFileSync(scenePath, 'utf8');
        const proposalPath = writeSceneProposal(projectRoot, {
            kind: 'pixifact.sceneProposal.v1',
            scene: 'scenes/Button.scene',
            baseRevision: createSceneRevision(current),
            content: '<Scene name="Button" script="src/scenes/Button.ts"><Text id="label" text="Play" /></Scene>',
        });

        const result = await runCli([
            'scene',
            'proposal',
            'check',
            '--project-root',
            projectRoot,
            '--scene',
            'scenes/Button.scene',
            '--proposal',
            proposalPath,
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.json.ok).toBe(true);
        expect(result.json.diffs[0]).toMatchObject({
            kind: 'nodePropChanged',
            prop: 'text',
            before: 'Start',
            after: 'Play',
        });
        expect(fs.readFileSync(scenePath, 'utf8')).toBe(current);
    });

    it('applies compiler scene proposals and writes canonical source', async () => {
        const projectRoot = createCompilerSceneProject();
        const scenePath = path.join(projectRoot, 'scenes', 'Button.scene');
        const current = fs.readFileSync(scenePath, 'utf8');
        const proposalPath = writeSceneProposal(projectRoot, {
            kind: 'pixifact.sceneProposal.v1',
            scene: 'scenes/Button.scene',
            baseRevision: createSceneRevision(current),
            content: '<Scene name="Button" script="src/scenes/Button.ts"><Text id="label" text="Play" /></Scene>',
        });

        const result = await runCli([
            'scene',
            'proposal',
            'apply',
            '--project-root',
            projectRoot,
            '--scene',
            'scenes/Button.scene',
            '--proposal',
            proposalPath,
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.json.ok).toBe(true);
        expect(fs.readFileSync(scenePath, 'utf8')).toBe([
            '<Scene name="Button" script="src/scenes/Button.ts">',
            '  <Text id="label" text="Play" />',
            '</Scene>',
            '',
        ].join('\n'));
    });

    it('rejects stale compiler scene proposals through the CLI', async () => {
        const projectRoot = createCompilerSceneProject();
        const proposalPath = writeSceneProposal(projectRoot, {
            kind: 'pixifact.sceneProposal.v1',
            scene: 'scenes/Button.scene',
            baseRevision: 'sha256:stale',
            content: '<Scene name="Button"><Text id="label" text="Play" /></Scene>',
        });

        const result = await runCli([
            'scene',
            'proposal',
            'apply',
            '--project-root',
            projectRoot,
            '--scene',
            'scenes/Button.scene',
            '--proposal',
            proposalPath,
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.json).toMatchObject({
            ok: false,
            error: 'Scene proposal baseRevision does not match current scene revision.',
        });
    });

    it('rejects compiler scene proposals with missing texture assets through the CLI', async () => {
        const projectRoot = createCompilerSceneProject();
        const scenePath = path.join(projectRoot, 'scenes', 'Button.scene');
        const current = fs.readFileSync(scenePath, 'utf8');
        const proposalPath = writeSceneProposal(projectRoot, {
            kind: 'pixifact.sceneProposal.v1',
            scene: 'scenes/Button.scene',
            baseRevision: createSceneRevision(current),
            content: '<Scene name="Button" script="src/scenes/Button.ts"><Sprite id="icon" texture="assets/missing.png" /></Scene>',
        });

        const result = await runCli([
            'scene',
            'proposal',
            'check',
            '--project-root',
            projectRoot,
            '--scene',
            'scenes/Button.scene',
            '--proposal',
            proposalPath,
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.json).toMatchObject({
            ok: false,
            error: 'Scene proposal validation failed.',
            diagnostics: [{
                path: '0:icon',
                prop: 'texture',
                expected: 'existing project asset',
                actual: 'assets/missing.png',
            }],
        });
    });

    it('rejects private compiler Scene instance props through the CLI', async () => {
        const projectRoot = createCompilerSceneProject();
        fs.writeFileSync(path.join(projectRoot, 'scenes', 'Button.scene'), [
            '<Scene name="Button" script="src/scenes/Button.ts" />',
            '',
        ].join('\n'), 'utf8');
        fs.writeFileSync(path.join(projectRoot, 'scenes', 'MainMenu.scene'), [
            '<Scene name="MainMenu" script="src/scenes/MainMenu.ts">',
            '  <Button id="start" scene="scenes/Button.scene" label="Start" />',
            '</Scene>',
            '',
        ].join('\n'), 'utf8');
        fs.mkdirSync(path.join(projectRoot, 'src', 'scenes'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'Button.ts'), [
            'import { Container } from "pixi.js";',
            'import { prop, scene } from "pixifact/compiler";',
            '',
            '@scene()',
            'export class Button extends Container {',
            '  @prop({ type: "string", default: "Button" })',
            '  accessor label = "Button";',
            '}',
            '',
        ].join('\n'), 'utf8');
        const scenePath = path.join(projectRoot, 'scenes', 'MainMenu.scene');
        const current = fs.readFileSync(scenePath, 'utf8');
        const proposalPath = writeSceneProposal(projectRoot, {
            kind: 'pixifact.sceneProposal.v1',
            scene: 'scenes/MainMenu.scene',
            baseRevision: createSceneRevision(current),
            content: [
                '<Scene name="MainMenu" script="src/scenes/MainMenu.ts">',
                '  <Button id="start" scene="scenes/Button.scene" label="Start" secret="true" />',
                '</Scene>',
            ].join('\n'),
        });

        const result = await runCli([
            'scene',
            'proposal',
            'check',
            '--project-root',
            projectRoot,
            '--scene',
            'scenes/MainMenu.scene',
            '--proposal',
            proposalPath,
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.json).toMatchObject({
            ok: false,
            error: 'Scene proposal validation failed.',
            diagnostics: [{
                path: '0:start',
                prop: 'secret',
                expected: 'public prop declared by scenes/Button.scene',
                actual: 'unknown prop',
            }],
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

    it('routes live scene reads to the live editor bridge when connected', async () => {
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

    it('returns live SceneDocument context without writing files', async () => {
        const document = openLiveMenuScene();
        const handlers = createLiveEditorActionHandlers();
        const sceneResult = await handlers['scene.get']({});
        const nodeResult = await handlers['node.inspect']({
            node: 'menuLabel',
        });

        expect(sceneResult).toMatchObject({
            connected: true,
            sourceType: 'live-editor',
            scenePath: 'GameProject/scenes/Menu.scene',
            dirty: false,
            selection: { type: 'node', node: 'menuLabel' },
            summary: {
                name: 'Menu',
                nodeCount: 2,
            },
        });
        expect(nodeResult).toMatchObject({
            kind: 'text',
            key: 'menuLabel',
            locator: 'menuLabel',
            depth: 1,
            parent: 'root',
        });
        expect(document.scene.root.children?.[0].text?.value).toBe('Start');
        expect(document.dirty).toBe(false);
        expect(host.writeHostProjectFileText).not.toHaveBeenCalled();
    });

    it('returns live compiler scene context including the selected node', async () => {
        openLiveCompilerScene();
        const handlers = createLiveEditorActionHandlers();

        const sceneResult = await handlers['scene.get']({});
        const nodeResult = await handlers['node.inspect']({
            node: '0:content/0:menuLabel',
        });

        expect(sceneResult).toMatchObject({
            connected: true,
            sourceType: 'compiler-scene',
            scenePath: 'GameProject/scenes/Menu.scene',
            dirty: false,
            selection: { type: 'node', node: '0:content/0:menuLabel' },
            summary: {
                name: 'Menu',
                script: 'src/scenes/Menu.ts',
                nodeCount: 2,
            },
        });
        expect(sceneResult.revision).toBe(createSceneRevision([
            '<Scene name="Menu" script="src/scenes/Menu.ts">',
            '  <Container id="content">',
            '    <Text id="menuLabel" text="Start" />',
            '  </Container>',
            '</Scene>',
            '',
        ].join('\n')));
        expect(nodeResult).toMatchObject({
            kind: 'pixi',
            type: 'Text',
            id: 'menuLabel',
            locator: '0:content/0:menuLabel',
            depth: 1,
            parent: '0:content',
        });
        expect(host.writeHostProjectFileText).not.toHaveBeenCalled();
    });

    it('does not expose legacy live mutation commands', async () => {
        const callAction = vi.fn(async () => ({}));
        const result = await executePixifactCli([
            'live',
            'commands',
            'apply',
        ], {
            liveBridge: {
                connected: true,
                stop: () => {},
                callAction,
            },
        });
        const parsed = JSON.parse(result.stderr);

        expect(result.exitCode).toBe(1);
        expect(parsed).toMatchObject({
            ok: false,
            error: 'Unknown Pixifact live command "commands apply".',
        });
        expect(callAction).not.toHaveBeenCalled();
    });
});
