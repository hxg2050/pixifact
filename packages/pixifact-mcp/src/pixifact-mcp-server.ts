import readline from 'node:readline';
import { createEditorAutomation } from './editorAutomation';
import { createLiveBridgeServer } from './liveBridgeServer';

interface JsonRpcRequest {
    jsonrpc?: unknown;
    id?: unknown;
    method?: unknown;
    params?: unknown;
}

interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: unknown;
    result?: unknown;
    error?: {
        code: number;
        message: string;
        data?: unknown;
    };
}

interface ToolCallParams {
    name?: unknown;
    arguments?: unknown;
}

type Automation = ReturnType<typeof createEditorAutomation>;
type ToolHandler = (input: unknown) => unknown | Promise<unknown>;
type LiveBridge = Pick<ReturnType<typeof createLiveBridgeServer>, 'connected' | 'callTool'>;

export const protocolVersion = '2025-06-18';

const commandSchema = {
    type: 'array',
    items: {
        type: 'object',
        additionalProperties: true,
    },
};

export const tools = [
    {
        name: 'get_project_summary',
        description: 'List files and Scene assets under a local Pixifact project root.',
        inputSchema: {
            type: 'object',
            properties: {
                projectRoot: {
                    type: 'string',
                    description: 'Absolute path to the local project root.',
                },
            },
            required: ['projectRoot'],
            additionalProperties: false,
        },
    },
    {
        name: 'get_scene',
        description: 'Read a Pixifact Scene or AI editor project JSON and return the editable Scene summary.',
        inputSchema: {
            type: 'object',
            properties: {
                projectRoot: {
                    type: 'string',
                },
                scenePath: {
                    type: 'string',
                    description: 'Project-relative path to a .scene or Pixifact AI editor project JSON file.',
                },
            },
            required: ['projectRoot', 'scenePath'],
            additionalProperties: false,
        },
    },
    {
        name: 'inspect_node',
        description: 'Inspect one node in a Scene by node id, key, or name locator.',
        inputSchema: {
            type: 'object',
            properties: {
                projectRoot: {
                    type: 'string',
                },
                scenePath: {
                    type: 'string',
                },
                node: {
                    type: 'string',
                },
            },
            required: ['projectRoot', 'scenePath', 'node'],
            additionalProperties: false,
        },
    },
    {
        name: 'dry_run_commands',
        description: 'Validate SceneCommand changes against a Scene and return diffs without writing files.',
        inputSchema: {
            type: 'object',
            properties: {
                projectRoot: {
                    type: 'string',
                },
                scenePath: {
                    type: 'string',
                },
                commands: commandSchema,
            },
            required: ['projectRoot', 'scenePath', 'commands'],
            additionalProperties: false,
        },
    },
    {
        name: 'apply_commands',
        description: 'Apply SceneCommand changes through SceneDocument and save the Scene file.',
        inputSchema: {
            type: 'object',
            properties: {
                projectRoot: {
                    type: 'string',
                },
                scenePath: {
                    type: 'string',
                },
                commands: commandSchema,
            },
            required: ['projectRoot', 'scenePath', 'commands'],
            additionalProperties: false,
        },
    },
    {
        name: 'validate_commands',
        description: 'Validate that SceneCommand changes can be applied in order without writing files.',
        inputSchema: {
            type: 'object',
            properties: {
                projectRoot: {
                    type: 'string',
                },
                scenePath: {
                    type: 'string',
                },
                commands: commandSchema,
            },
            required: ['projectRoot', 'scenePath', 'commands'],
            additionalProperties: false,
        },
    },
];

const toolByName = new Map(tools.map((tool) => [tool.name, tool]));

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonContent(value: unknown) {
    return {
        content: [{
            type: 'text',
            text: JSON.stringify(value, null, 2),
        }],
    };
}

function errorResponse(id: unknown, code: number, message: string, data?: unknown): JsonRpcResponse {
    return {
        jsonrpc: '2.0',
        id,
        error: {
            code,
            message,
            data,
        },
    };
}

function resultResponse(id: unknown, result: unknown): JsonRpcResponse {
    return {
        jsonrpc: '2.0',
        id,
        result,
    };
}

export function createMcpRequestHandler(options: { automation?: Automation; liveBridge?: LiveBridge } = {}) {
    const automation = options.automation ?? createEditorAutomation();
    const liveBridge = options.liveBridge;
    const handlers: Record<string, ToolHandler> = {
        get_project_summary: automation.getProjectSummary.bind(automation),
        get_scene: automation.getScene.bind(automation),
        inspect_node: automation.inspectNode.bind(automation),
        dry_run_commands: automation.dryRunCommands.bind(automation),
        apply_commands: automation.applyCommands.bind(automation),
        validate_commands: automation.validateCommands.bind(automation),
    };

    return async function handleMcpRequest(message: JsonRpcRequest): Promise<JsonRpcResponse | undefined> {
        if (!message || message.jsonrpc !== '2.0') {
            return errorResponse(null, -32600, 'Invalid JSON-RPC request.');
        }

        if (!Object.prototype.hasOwnProperty.call(message, 'id')) {
            return undefined;
        }

        try {
            switch (message.method) {
                case 'initialize':
                    return resultResponse(message.id, {
                        protocolVersion,
                        capabilities: {
                            tools: {},
                        },
                        serverInfo: {
                            name: 'pixifact-editor',
                            version: '0.1.0',
                        },
                    });
                case 'ping':
                    return resultResponse(message.id, {});
                case 'tools/list':
                    return resultResponse(message.id, { tools });
                case 'tools/call': {
                    const params = isRecord(message.params) ? message.params as ToolCallParams : {};
                    const name = params.name;
                    const handler = typeof name === 'string' ? handlers[name] : undefined;
                    if (typeof name !== 'string' || !toolByName.has(name) || typeof handler !== 'function') {
                        return resultResponse(message.id, {
                            content: [{
                                type: 'text',
                                text: `Unknown tool "${String(name)}".`,
                            }],
                            isError: true,
                        });
                    }
                    const result = liveBridge?.connected
                        ? await liveBridge.callTool(name, params.arguments ?? {})
                        : await handler(params.arguments ?? {});
                    return resultResponse(message.id, jsonContent(result));
                }
                default:
                    return errorResponse(message.id, -32601, `Unknown method "${message.method}".`);
            }
        } catch (error) {
            return resultResponse(message.id, {
                content: [{
                    type: 'text',
                    text: error instanceof Error ? error.message : String(error),
                }],
                isError: true,
            });
        }
    };
}

export async function runStdioServer(options: {
    input?: NodeJS.ReadableStream;
    output?: NodeJS.WritableStream;
    automation?: Automation;
    liveBridge?: LiveBridge;
} = {}) {
    const input = options.input ?? process.stdin;
    const output = options.output ?? process.stdout;
    const handleMcpRequest = createMcpRequestHandler(options);
    const reader = readline.createInterface({
        input,
        crlfDelay: Infinity,
    });

    for await (const line of reader) {
        if (!line.trim()) {
            continue;
        }

        let message: JsonRpcRequest;
        try {
            message = JSON.parse(line);
        } catch {
            output.write(`${JSON.stringify(errorResponse(null, -32700, 'Parse error.'))}\n`);
            continue;
        }

        const response = await handleMcpRequest(message);
        if (response) {
            output.write(`${JSON.stringify(response)}\n`);
        }
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const liveBridge = createLiveBridgeServer();
    await runStdioServer({ liveBridge });
}
