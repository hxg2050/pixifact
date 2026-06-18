import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSceneRevision, parseSceneTemplate } from 'pixifact/compiler';
import { executePixifactCli } from '../packages/pixifact-cli/src/pixifact-cli';
import {
    loadCompilerSceneDocument,
    resetCompilerSceneDocument,
    selectCompilerSceneNode,
} from '../apps/editor/src/document/compilerSceneDocumentController';
import { useEditorStore } from '../apps/editor/src/editorStore';
import { createLiveEditorActionHandlers } from '../apps/editor/src/agent/liveEditorClient';
import {
    clearLastExternalSceneSync,
    setLastExternalSceneSync,
} from '../apps/editor/src/services/externalSceneSyncState';

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
    fs.mkdirSync(path.join(root, 'src', 'scenes'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'scenes', 'Button.scene'), [
        '<Scene name="Button">',
        '  <Text id="label" text="Start" />',
        '</Scene>',
        '',
    ].join('\n'), 'utf8');
    fs.writeFileSync(path.join(root, 'src', 'scenes', 'Button.ts'), [
        'import { Group } from "pixifact/runtime";',
        'import { scene } from "pixifact/compiler";',
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
        'import { scene } from "pixifact/compiler";',
        '',
        '@scene()',
        'export class Button extends Group {}',
        '',
    ].join('\n'), 'utf8');
    return root;
}

async function runCli(argv: string[]) {
    const result = await executePixifactCli(argv);
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

function openLiveCompilerScene() {
    resetCompilerSceneDocument();
    const template = parseSceneTemplate([
        '<Scene name="Menu">',
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
    clearLastExternalSceneSync();
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
        expect(result.json.scenes).toContain('src/scenes/Button.scene');
    });

    it('includes pixifact project run config in summary without running it', async () => {
        const projectRoot = createTempProject();
        fs.writeFileSync(path.join(projectRoot, 'pixifact.project.json'), JSON.stringify({
            version: 1,
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
        expect(savedScene).toBe('<Scene name="Login" width="960" height="540">\n</Scene>\n');
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
            import { part, prop, scene } from 'pixifact/compiler';

            @scene()
            export class Button extends Group {
                @part()
                protected declare labelText: Text;

                @prop({ type: String, default: 'Button' })
                accessor label = 'Button';
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
            'import { scene } from "pixifact/compiler";',
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
        expect(result.json).toMatchObject({
            ok: true,
            projectRoot,
            sceneCount: 2,
            scenes: [
                { scenePath: 'src/scenes/Button.scene' },
                { scenePath: 'src/scenes/MainMenu.scene' },
            ],
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
            'import { scene } from "pixifact/compiler";',
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
            'import { scene } from "pixifact/compiler";',
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
            'import { prop, scene } from "pixifact/compiler";',
            '',
            '@scene()',
            'export class Button extends Group {',
            '  @prop({ type: String, default: "Button" })',
            '  accessor label = "Button";',
            '}',
            '',
        ].join('\n'), 'utf8');
        fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'MainMenu.ts'), [
            'import { Group } from "pixifact/runtime";',
            'import { scene } from "pixifact/compiler";',
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
            'import { scene } from "pixifact/compiler";',
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
            'import { scene } from "pixifact/compiler";',
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
            'import { part, scene } from "pixifact/compiler";',
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
            'import { prop, scene } from "pixifact/compiler";',
            '',
            '@scene()',
            'export class PrimaryButton extends Group {',
            '  @prop({ type: String, default: "Button" })',
            '  accessor label = "Button";',
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
            'import { scene } from "pixifact/compiler";',
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
            'import { part, scene } from "pixifact/compiler";',
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
            'import { scene } from "pixifact/compiler";',
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
                nodeCount: 2,
            },
        });
        expect(sceneResult).not.toHaveProperty('lastExternalSync');
        expect(sceneResult.revision).toBe(createSceneRevision([
            '<Scene name="Menu">',
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

    it('returns the last external compiler scene sync result to live agents', async () => {
        openLiveCompilerScene();
        setLastExternalSceneSync('GameProject/scenes/Menu.scene', {
            status: 'validationFailed',
            message: '外部 Scene 修改未刷新：校验失败。',
            validation: {
                ok: false,
                scene: 'GameProject/scenes/Menu.scene',
                revision: 'sha256:invalid',
                error: 'Scene validation failed.',
                diagnostics: [{
                    path: '0:icon',
                    prop: 'texture',
                    expected: 'existing project asset',
                    actual: 'assets/missing.png',
                    hint: 'Use an asset path that exists in the project before validating the scene.',
                }],
                hint: 'Fix the listed diagnostics, then run scene validate again.',
            },
        });
        const handlers = createLiveEditorActionHandlers();

        const sceneResult = await handlers['scene.get']({});

        expect(sceneResult).toMatchObject({
            sourceType: 'compiler-scene',
            lastExternalSync: {
                status: 'validationFailed',
                message: '外部 Scene 修改未刷新：校验失败。',
                validation: {
                    ok: false,
                    scene: 'GameProject/scenes/Menu.scene',
                    diagnostics: [{
                        path: '0:icon',
                        prop: 'texture',
                        expected: 'existing project asset',
                        actual: 'assets/missing.png',
                    }],
                },
            },
        });
    });

    it('does not return external compiler scene sync state from another scene', async () => {
        openLiveCompilerScene();
        setLastExternalSceneSync('GameProject/scenes/Other.scene', {
            status: 'dirtySkipped',
            message: '当前打开的 Scene 有未保存修改，已跳过外部文件刷新。',
        });
        const handlers = createLiveEditorActionHandlers();

        const sceneResult = await handlers['scene.get']({});

        expect(sceneResult).toMatchObject({
            sourceType: 'compiler-scene',
            scenePath: 'GameProject/scenes/Menu.scene',
        });
        expect(sceneResult).not.toHaveProperty('lastExternalSync');
    });

    it('keeps the last external compiler scene sync result when ignored events arrive', async () => {
        openLiveCompilerScene();
        setLastExternalSceneSync('GameProject/scenes/Menu.scene', {
            status: 'dirtySkipped',
            message: '当前打开的 Scene 有未保存修改，已跳过外部文件刷新。',
        });
        setLastExternalSceneSync('GameProject/scenes/Menu.scene', { status: 'ignored' });
        const handlers = createLiveEditorActionHandlers();

        const sceneResult = await handlers['scene.get']({});

        expect(sceneResult).toMatchObject({
            sourceType: 'compiler-scene',
            lastExternalSync: {
                status: 'dirtySkipped',
                message: '当前打开的 Scene 有未保存修改，已跳过外部文件刷新。',
            },
        });
    });

    it('does not expose live mutation commands', async () => {
        const callAction = vi.fn(async () => ({}));
        const result = await executePixifactCli([
            'live',
            'template',
            'add',
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
            error: 'Unknown Pixifact live command "template add".',
        });
        expect(callAction).not.toHaveBeenCalled();
    });
});
