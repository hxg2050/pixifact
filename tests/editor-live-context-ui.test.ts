import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectFileTreeNode } from '../apps/editor/src/services/projectFileTree';
import { useEditorStore } from '../apps/editor/src/editorStore';
import { EditorApp } from '../apps/editor/src/EditorApp';
import {
    getCompilerSceneDocument,
    loadCompilerSceneDocument,
    resetCompilerSceneDocument,
} from '../apps/editor/src/document/compilerSceneDocumentController';
import { parseSceneTemplate } from '../packages/pixifact/src/compiler/templateParser';

const host = vi.hoisted(() => ({
    files: new Map<string, string>(),
    writes: [] as Array<{ projectRootPath: string; filePath: string; content: string }>,
    fileChangedHandler: undefined as ((event: { projectRootPath: string; path: string; kind: string }) => void) | undefined,
}));

function missingHostCall(name: string) {
    return vi.fn(async () => {
        throw new Error(`Unexpected host call ${name}.`);
    });
}

vi.mock('../apps/editor/src/services/hostBridge', () => ({
    createHostProjectDirectory: missingHostCall('createHostProjectDirectory'),
    createHostProjectFile: missingHostCall('createHostProjectFile'),
    deleteHostProjectEntry: missingHostCall('deleteHostProjectEntry'),
    openHostCodeFile: missingHostCall('openHostCodeFile'),
    openHostDefaultFile: missingHostCall('openHostDefaultFile'),
    pickHostProjectFolder: missingHostCall('pickHostProjectFolder'),
    readHostProjectFileBytes: missingHostCall('readHostProjectFileBytes'),
    readHostProjectFileText: vi.fn(async (_projectRootPath: string, filePath: string) => {
        const content = host.files.get(filePath);
        if (content === undefined) {
            throw new Error(`Missing test file ${filePath}.`);
        }
        return content;
    }),
    readHostProjectFileTree: vi.fn(async () => hostProjectTree()),
    renameHostProjectEntry: missingHostCall('renameHostProjectEntry'),
    watchHostProjectFiles: vi.fn(async () => {}),
    listenHostProjectFileChanged: vi.fn(async (handler: (event: { projectRootPath: string; path: string; kind: string }) => void) => {
        host.fileChangedHandler = handler;
        return () => {
            host.fileChangedHandler = undefined;
        };
    }),
    writeHostProjectFileText: vi.fn(async (projectRootPath: string, filePath: string, content: string) => {
        host.writes.push({ projectRootPath, filePath, content });
        host.files.set(filePath, content);
    }),
}));

function projectTree(): ProjectFileTreeNode {
    return {
        id: 'GameProject',
        name: 'GameProject',
        path: 'GameProject',
        kind: 'folder',
        depth: 0,
        systemPath: '/repo/GameProject',
        projectRootPath: '/repo/GameProject',
        children: [{
            id: 'GameProject/assets',
            name: 'assets',
            path: 'GameProject/assets',
            kind: 'folder',
            depth: 1,
            children: [{
                id: 'GameProject/assets/play.png',
                name: 'play.png',
                path: 'GameProject/assets/play.png',
                kind: 'asset',
                depth: 2,
            }],
        }, {
            id: 'GameProject/src',
            name: 'src',
            path: 'GameProject/src',
            kind: 'folder',
            depth: 1,
            children: [{
                id: 'GameProject/src/scenes',
                name: 'scenes',
                path: 'GameProject/src/scenes',
                kind: 'folder',
                depth: 2,
                children: [{
                    id: 'GameProject/src/scenes/Button.scene',
                    name: 'Button.scene',
                    path: 'GameProject/src/scenes/Button.scene',
                    kind: 'scene',
                    depth: 3,
                }, {
                    id: 'GameProject/src/scenes/Child.scene',
                    name: 'Child.scene',
                    path: 'GameProject/src/scenes/Child.scene',
                    kind: 'scene',
                    depth: 3,
                }, {
                    id: 'GameProject/src/scenes/Button.ts',
                    name: 'Button.ts',
                    path: 'GameProject/src/scenes/Button.ts',
                    kind: 'script',
                    depth: 3,
                }, {
                    id: 'GameProject/src/scenes/Child.ts',
                    name: 'Child.ts',
                    path: 'GameProject/src/scenes/Child.ts',
                    kind: 'script',
                    depth: 3,
                }],
            }],
        }],
    };
}

function hostProjectTree() {
    const root = projectTree();
    function addSystemPath(node: ProjectFileTreeNode): ProjectFileTreeNode {
        return {
            ...node,
            systemPath: `/repo/${node.path}`,
            children: node.children?.map(addSystemPath),
        };
    }
    return {
        ...addSystemPath(root),
        systemPath: '/repo/GameProject',
    };
}

function currentScene() {
    return [
        '<Scene name="Button">',
        '  <Text id="label" text="Start" />',
        '</Scene>',
        '',
    ].join('\n');
}

function updatedScene() {
    return [
        '<Scene name="Button">',
        '  <Text id="label" text="Play" />',
        '</Scene>',
        '',
    ].join('\n');
}

function invalidScene() {
    return [
        '<Scene name="Button">',
        '  <Text id="label" unknownProp="Broken" />',
        '</Scene>',
        '',
    ].join('\n');
}

function scriptSource() {
    return [
        'import { Group } from "pixifact/runtime";',
        'import { scene } from "pixifact/compiler";',
        '@scene()',
        'export class Button extends Group {}',
    ].join('\n');
}

function childScene() {
    return [
        '<Scene name="Child" />',
        '',
    ].join('\n');
}

function childScriptSource() {
    return [
        'import { Group } from "pixifact/runtime";',
        'import { prop, scene } from "pixifact/compiler";',
        '@scene()',
        'export class Child extends Group {',
        '  @prop({ type: String, default: "Child" })',
        '  accessor label = "Child";',
        '}',
    ].join('\n');
}

function resetHostFiles() {
    host.files = new Map([
        ['GameProject/src/scenes/Button.scene', currentScene()],
        ['GameProject/src/scenes/Child.scene', childScene()],
        ['GameProject/src/scenes/Button.ts', scriptSource()],
        ['GameProject/src/scenes/Child.ts', childScriptSource()],
    ]);
    host.writes = [];
    host.fileChangedHandler = undefined;
}

function setEditorProject() {
    useEditorStore.setState({
        language: 'zh-CN',
        projectName: 'GameProject',
        projectTree: projectTree(),
        selectedProjectFilePath: 'GameProject/src/scenes/Button.scene',
        openedScenePath: 'GameProject/src/scenes/Button.scene',
        expandedProjectFolders: ['GameProject', 'GameProject/src', 'GameProject/src/scenes'],
        expandedHierarchyNodesByScene: {},
    });
}

function textContent(container: HTMLElement) {
    return container.textContent ?? '';
}

async function renderEditorApp() {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
        root.render(createElement(EditorApp));
        await Promise.resolve();
    });
    return {
        container,
        async cleanup() {
            await act(async () => {
                root.unmount();
            });
            container.remove();
        },
    };
}

beforeEach(() => {
    localStorage.clear();
    resetHostFiles();
    resetCompilerSceneDocument();
    setEditorProject();
});

afterEach(() => {
    resetCompilerSceneDocument();
    document.body.innerHTML = '';
});

describe('Editor external Scene sync UI', () => {
    it('shows successful external compiler Scene refresh feedback in the status bar', async () => {
        loadCompilerSceneDocument({
            scenePath: 'GameProject/src/scenes/Button.scene',
            template: parseSceneTemplate(currentScene()),
            sceneInterfaces: {},
        });
        const view = await renderEditorApp();
        try {
            await act(async () => {
                host.files.set('GameProject/src/scenes/Button.scene', updatedScene());
                host.fileChangedHandler?.({
                    projectRootPath: '/repo/GameProject',
                    path: 'GameProject/src/scenes/Button.scene',
                    kind: 'scene',
                });
                await Promise.resolve();
                await Promise.resolve();
            });

            expect(textContent(view.container)).toContain('Sync: 外部 Scene 修改已刷新，校验通过。');
            expect(view.container.querySelector('[data-testid="workbench-status-bar"]')).toBeTruthy();
            expect(textContent(view.container)).toContain('Sync: 外部 Scene 修改已刷新，校验通过。');
            expect(getCompilerSceneDocument()?.template.children[0]?.props.text).toBe('Play');
        } finally {
            await view.cleanup();
        }
    });

    it('shows readable diagnostics when external compiler Scene refresh validation fails', async () => {
        loadCompilerSceneDocument({
            scenePath: 'GameProject/src/scenes/Button.scene',
            template: parseSceneTemplate(currentScene()),
            sceneInterfaces: {},
        });
        const view = await renderEditorApp();
        try {
            await act(async () => {
                host.files.set('GameProject/src/scenes/Button.scene', invalidScene());
                host.fileChangedHandler?.({
                    projectRootPath: '/repo/GameProject',
                    path: 'GameProject/src/scenes/Button.scene',
                    kind: 'scene',
                });
                await Promise.resolve();
                await Promise.resolve();
            });

            const diagnosticsPanel = view.container.querySelector('[data-testid="scene-sync-diagnostics"]');
            const text = textContent(view.container);

            expect(diagnosticsPanel).toBeTruthy();
            expect(text).toContain('Sync: 外部 Scene 修改未刷新：校验失败。');
            expect(text).toContain('外部 Scene 修改未刷新');
            expect(text).toContain('预览仍为上一次有效 Scene。');
            expect(text).toContain('src/scenes/Button.scene');
            expect(text).toContain('0:label');
            expect(text).toContain('unknownProp');
            expect(text).toContain('known Text prop');
            expect(text).toContain('unknown prop');
            expect(text).toContain('Use the editor inspector or scene inspect command to list supported props for this node type.');
            expect(text).toContain('bun run pixifact -- scene validate --project-root');
            expect(text).toContain('--scene src/scenes/Button.scene');
            expect(text).toContain('bun run pixifact -- compile-scenes --project-root');
            expect(getCompilerSceneDocument()?.template.children[0]?.props.text).toBe('Start');
        } finally {
            await view.cleanup();
        }
    });
});
