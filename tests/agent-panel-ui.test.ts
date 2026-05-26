import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSceneRevision } from 'pixifact/compiler';
import type { ProjectFileTreeNode } from '../apps/editor/src/services/projectFileTree';
import { useEditorStore } from '../apps/editor/src/editorStore';
import { AgentPanel } from '../apps/editor/src/panels/AgentPanel';
import {
    getCompilerSceneDocument,
    resetCompilerSceneDocument,
} from '../apps/editor/src/document/compilerSceneDocumentController';

const host = vi.hoisted(() => ({
    files: new Map<string, string>(),
    writes: [] as Array<{ projectRootPath: string; filePath: string; content: string }>,
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
            id: 'GameProject/scenes',
            name: 'scenes',
            path: 'GameProject/scenes',
            kind: 'folder',
            depth: 1,
            children: [{
                id: 'GameProject/scenes/Button.scene',
                name: 'Button.scene',
                path: 'GameProject/scenes/Button.scene',
                kind: 'scene',
                depth: 2,
            }, {
                id: 'GameProject/scenes/Child.scene',
                name: 'Child.scene',
                path: 'GameProject/scenes/Child.scene',
                kind: 'scene',
                depth: 2,
            }],
        }, {
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
        '<Scene name="Button" script="src/scenes/Button.ts">',
        '  <Text id="label" text="Start" />',
        '</Scene>',
        '',
    ].join('\n');
}

function updatedScene() {
    return [
        '<Scene name="Button" script="src/scenes/Button.ts">',
        '  <Text id="label" text="Play" />',
        '</Scene>',
        '',
    ].join('\n');
}

function scriptSource() {
    return [
        'import { Container } from "pixi.js";',
        'import { scene } from "pixifact/compiler";',
        '@scene()',
        'export class Button extends Container {}',
    ].join('\n');
}

function childScene() {
    return [
        '<Scene name="Child" script="src/scenes/Child.ts" />',
        '',
    ].join('\n');
}

function childScriptSource() {
    return [
        'import { Container } from "pixi.js";',
        'import { prop, scene } from "pixifact/compiler";',
        '@scene()',
        'export class Child extends Container {',
        '  @prop({ type: "string", default: "Child" })',
        '  accessor label = "Child";',
        '}',
    ].join('\n');
}

function resetHostFiles() {
    host.files = new Map([
        ['GameProject/scenes/Button.scene', currentScene()],
        ['GameProject/scenes/Child.scene', childScene()],
        ['GameProject/src/scenes/Button.ts', scriptSource()],
        ['GameProject/src/scenes/Child.ts', childScriptSource()],
    ]);
    host.writes = [];
}

function proposalText(content: string, baseRevision = createSceneRevision(currentScene())) {
    return JSON.stringify({
        kind: 'pixifact.sceneProposal.v1',
        scene: 'scenes/Button.scene',
        baseRevision,
        content,
    });
}

function setEditorProject() {
    useEditorStore.setState({
        language: 'zh-CN',
        projectName: 'GameProject',
        projectTree: projectTree(),
        selectedProjectFilePath: 'GameProject/scenes/Button.scene',
        openedScenePath: 'GameProject/scenes/Button.scene',
        expandedProjectFolders: ['GameProject', 'GameProject/scenes'],
        expandedHierarchyNodesByScene: {},
    });
}

function setNativeValue(element: HTMLTextAreaElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(element, value);
}

function textContent(container: HTMLElement) {
    return container.textContent ?? '';
}

function buttonByText(container: HTMLElement, text: string) {
    const button = [...container.querySelectorAll('button')]
        .find((candidate) => candidate.textContent?.includes(text));
    if (!button) {
        throw new Error(`Missing button ${text}.`);
    }
    return button as HTMLButtonElement;
}

async function renderAgentPanel() {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
        root.render(createElement(AgentPanel));
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

async function pasteProposal(container: HTMLElement, text: string) {
    const textarea = container.querySelector('textarea[aria-label="Scene proposal JSON"]') as HTMLTextAreaElement | null;
    if (!textarea) {
        throw new Error('Missing proposal textarea.');
    }
    await act(async () => {
        setNativeValue(textarea, text);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

async function clickButton(button: HTMLButtonElement) {
    await act(async () => {
        button.click();
        await Promise.resolve();
    });
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

describe('Agent panel proposal review UI', () => {
    it('reviews and applies a pasted scene proposal, then refreshes the current compiler scene document', async () => {
        const view = await renderAgentPanel();
        try {
            await pasteProposal(view.container, proposalText(updatedScene()));

            await clickButton(buttonByText(view.container, '检查 Proposal'));

            expect(textContent(view.container)).toContain('Proposal 可应用');
            expect(textContent(view.container)).toContain('Text#label.text: Start -> Play');
            expect(host.writes).toEqual([]);

            await clickButton(buttonByText(view.container, '应用 Proposal'));

            expect(host.writes).toEqual([{
                projectRootPath: '/repo/GameProject',
                filePath: 'GameProject/scenes/Button.scene',
                content: updatedScene(),
            }]);
            expect(getCompilerSceneDocument()?.scenePath).toBe('GameProject/scenes/Button.scene');
            expect(getCompilerSceneDocument()?.template.children[0]?.props.text).toBe('Play');
            expect(useEditorStore.getState().openedScenePath).toBe('GameProject/scenes/Button.scene');
        } finally {
            await view.cleanup();
        }
    });

    it('shows stale proposal errors without writing files', async () => {
        const view = await renderAgentPanel();
        try {
            await pasteProposal(view.container, proposalText(updatedScene(), 'scene:stale'));

            await clickButton(buttonByText(view.container, '检查 Proposal'));

            expect(textContent(view.container)).toContain('Scene proposal baseRevision does not match current scene revision.');
            expect(buttonByText(view.container, '应用 Proposal').disabled).toBe(true);
            expect(host.writes).toEqual([]);
        } finally {
            await view.cleanup();
        }
    });
});
