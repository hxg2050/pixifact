import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createMcpRequestHandler } from '../packages/pixifact-mcp/src/pixifact-mcp-server';

const tempRoots: string[] = [];

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

afterEach(() => {
    for (const root of tempRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('Pixifact MCP server', () => {
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
});
