import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { container, scene, text } from 'pixifact';
import type { SceneCommand } from 'pixifact';
import { createMcpRequestHandler } from '../packages/pixifact-mcp/src/pixifact-mcp-server';
import {
    getSceneDocument,
    resetSceneDocument,
} from '../apps/editor/src/document/sceneDocumentController';
import { useEditorStore } from '../apps/editor/src/editorStore';
import { createLiveEditorToolHandlers } from '../apps/editor/src/mcp/liveEditorClient';

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

interface ToolContentResult {
    content: Array<{
        type: 'text';
        text: string;
    }>;
    isError?: boolean;
}

interface ToolListResult {
    tools: Array<{
        name: string;
    }>;
}

function assertToolContentResult(value: unknown): ToolContentResult {
    expect(value).toMatchObject({
        content: [{
            type: 'text',
        }],
    });
    return value as ToolContentResult;
}

function assertToolListResult(value: unknown): ToolListResult {
    expect(value).toMatchObject({
        tools: expect.any(Array),
    });
    return value as ToolListResult;
}

function createTempProject() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pixifact-mcp-'));
    tempRoots.push(root);
    const scene = {
        version: 1,
        type: 'scene',
        name: 'MCP Button',
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

function request(method: string, params?: unknown, id = 1) {
    return {
        jsonrpc: '2.0',
        id,
        method,
        params,
    };
}

function parseToolResult(response: Awaited<ReturnType<ReturnType<typeof createMcpRequestHandler>>>) {
    expect(response).toBeDefined();
    const result = assertToolContentResult(response!.result);
    const text = result.content[0].text;
    return JSON.parse(text);
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

afterEach(() => {
    for (const root of tempRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('Pixifact MCP server', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    it('lists tools through the MCP tools/list method', async () => {
        const handle = createMcpRequestHandler();
        const response = await handle(request('tools/list'));
        expect(response).toBeDefined();
        const result = assertToolListResult(response!.result);

        expect(result.tools.map((tool) => tool.name)).toContain('apply_commands');
        expect(result.tools.map((tool) => tool.name)).toContain('dry_run_commands');
    });

    it('dry-runs commands without writing the Scene file', async () => {
        const projectRoot = createTempProject();
        const handle = createMcpRequestHandler();
        const command = {
            op: 'setNodeData',
            node: 'label',
            field: 'text',
            prop: 'value',
            value: 'Continue',
        };

        const response = await handle(request('tools/call', {
            name: 'dry_run_commands',
            arguments: {
                projectRoot,
                scenePath: 'button.scene',
                commands: [command],
            },
        }));
        const result = parseToolResult(response);
        const saved = JSON.parse(fs.readFileSync(path.join(projectRoot, 'button.scene'), 'utf8'));

        expect(result.ok).toBe(true);
        expect(result.diffs[0]).toMatchObject({
            target: 'label.text.value',
            before: 'Start',
            after: 'Continue',
        });
        expect(saved.root.children[0].text.value).toBe('Start');
    });

    it('applies commands through SceneDocument and saves the Scene file', async () => {
        const projectRoot = createTempProject();
        const handle = createMcpRequestHandler();
        const command = {
            op: 'setNodeData',
            node: 'label',
            field: 'text',
            prop: 'value',
            value: 'Continue',
        };

        const response = await handle(request('tools/call', {
            name: 'apply_commands',
            arguments: {
                projectRoot,
                scenePath: 'button.scene',
                commands: [command],
            },
        }));
        const result = parseToolResult(response);
        const saved = JSON.parse(fs.readFileSync(path.join(projectRoot, 'button.scene'), 'utf8'));

        expect(result.ok).toBe(true);
        expect(saved.root.children[0].text.value).toBe('Continue');
    });

    it('rejects file paths outside the project root', async () => {
        const projectRoot = createTempProject();
        const handle = createMcpRequestHandler();

        const response = await handle(request('tools/call', {
            name: 'get_scene',
            arguments: {
                projectRoot,
                scenePath: '../outside.scene',
            },
        }));

        expect(response).toBeDefined();
        const result = assertToolContentResult(response!.result);
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('inside projectRoot');
    });

    it('routes tool calls to the live editor bridge when connected', async () => {
        const handle = createMcpRequestHandler({
            liveBridge: {
                connected: true,
                callTool: async (tool, args) => ({
                    live: true,
                    tool,
                    args,
                }),
            },
        });

        const response = await handle(request('tools/call', {
            name: 'get_scene',
            arguments: {
                projectRoot: '/unused',
                scenePath: 'current.scene',
            },
        }));
        const result = parseToolResult(response);

        expect(result).toMatchObject({
            live: true,
            tool: 'get_scene',
            args: {
                scenePath: 'current.scene',
            },
        });
    });

    it('applies live editor commands to the current SceneDocument and saves the opened Scene', async () => {
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

        const handlers = createLiveEditorToolHandlers();
        const command: SceneCommand = {
            op: 'setNodeData',
            node: 'menuLabel',
            field: 'text',
            prop: 'value',
            value: 'Continue',
        };
        const result = await handlers.apply_commands({
            projectRoot: '/unused/project/root',
            scenePath: 'GameProject/scenes/Menu.scene',
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
});
