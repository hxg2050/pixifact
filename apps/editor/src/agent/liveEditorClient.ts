import { applyCommand, commandFailureDetails, createSceneTemplateCommands, dryRunProposal } from 'pixifact';
import type { CommandResult, SceneCommand, NodeSpec, SceneSpec } from 'pixifact';
import {
    getSceneDocument,
    refreshSceneDocument,
} from '../document/sceneDocumentController';
import { getCompilerSceneDocument } from '../document/compilerSceneDocumentController';
import { useEditorStore } from '../editorStore';
import {
    refreshProjectFileTree,
    saveSceneFile,
} from '../services/projectFileTree';
import {
    pixifactAgentBridgeUrl,
    type LiveBridgeClientMessage,
    type LiveBridgeRequestMessage,
    type LiveBridgeServerMessage,
} from './liveBridge';

interface ToolInput {
    projectRoot?: unknown;
    scenePath?: unknown;
    node?: unknown;
    commands?: unknown;
    kind?: unknown;
    parent?: unknown;
    key?: unknown;
    label?: unknown;
}

interface ProjectFileSummary {
    path: string;
    kind: string;
}

interface NodeSummary {
    id?: string;
    key?: string;
    role?: string;
    name?: string;
    kind: NodeSpec['kind'];
    locator: string;
    depth: number;
    transform?: NodeSpec['transform'];
    components: Array<{
        id?: string;
        type: string;
        propKeys: string[];
    }>;
    childCount: number;
    children: NodeSummary[];
}

type DetailedNode = NodeSpec & {
    locator: string;
    depth: number;
    parent?: string;
    childCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertRecord(value: unknown, name: string) {
    if (!isRecord(value)) {
        throw new Error(`${name} must be an object.`);
    }
    return value;
}

function assertString(value: unknown, name: string) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`${name} must be a non-empty string.`);
    }
    return value;
}

function assertCommands(value: unknown): SceneCommand[] {
    if (!Array.isArray(value)) {
        throw new Error('commands must be an array.');
    }
    return value as SceneCommand[];
}

function optionalString(value: unknown) {
    return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function templateCommands(args: ToolInput): SceneCommand[] {
    return createSceneTemplateCommands({
        kind: assertString(args.kind, 'kind'),
        parent: optionalString(args.parent),
        key: assertString(args.key, 'key'),
        label: optionalString(args.label),
    });
}

function getNodeLocator(node: NodeSpec) {
    return node.id ?? node.key ?? node.name ?? '';
}

function summarizeNode(node: NodeSpec, depth = 0): NodeSummary {
    const children = node.kind === 'container' ? node.children ?? [] : [];
    return {
        id: node.id,
        key: node.key,
        role: node.role,
        name: node.name,
        kind: node.kind,
        locator: getNodeLocator(node),
        depth,
        transform: node.transform,
        components: (node.components ?? []).map((component) => ({
            id: component.id,
            type: component.type,
            propKeys: Object.keys(component.props ?? {}),
        })),
        childCount: children.length,
        children: children.map((child) => summarizeNode(child, depth + 1)),
    };
}

function collectNodes(node: NodeSpec, depth = 0, parent?: string): Array<{
    locator: string;
    parent?: string;
    depth: number;
    componentCount: number;
    childCount: number;
}> {
    return [
        {
            locator: getNodeLocator(node),
            parent,
            depth,
            componentCount: node.components?.length ?? 0,
            childCount: node.kind === 'container' ? node.children?.length ?? 0 : 0,
        },
        ...(node.kind === 'container' ? (node.children ?? []).flatMap((child) => collectNodes(child, depth + 1, getNodeLocator(node))) : []),
    ];
}

function collectDetailedNodes(node: NodeSpec, depth = 0, parent?: string): DetailedNode[] {
    return [
        {
            ...structuredClone(node),
            locator: getNodeLocator(node),
            depth,
            parent,
            childCount: node.kind === 'container' ? node.children?.length ?? 0 : 0,
        },
        ...(node.kind === 'container' ? (node.children ?? []).flatMap((child) => collectDetailedNodes(child, depth + 1, getNodeLocator(node))) : []),
    ];
}

function summarizeScene(scene: SceneSpec) {
    const nodes = collectNodes(scene.root);
    return {
        name: scene.name,
        version: scene.version,
        nodeCount: nodes.length,
        componentCount: nodes.reduce((sum, node) => sum + node.componentCount, 0),
        root: summarizeNode(scene.root),
    };
}

function collectProjectFiles(node: { path: string; kind: string; children?: Array<{ path: string; kind: string; children?: unknown[] }> }): ProjectFileSummary[] {
    return [
        {
            path: node.path,
            kind: node.kind,
        },
        ...(node.children ?? []).flatMap((child) => collectProjectFiles(child as Parameters<typeof collectProjectFiles>[0])),
    ];
}

function matchesCurrentScene(args: ToolInput) {
    if (args.scenePath === undefined) {
        return true;
    }
    const openedScenePath = useEditorStore.getState().openedScenePath;
    if (!openedScenePath) {
        return false;
    }
    return assertString(args.scenePath, 'scenePath') === openedScenePath;
}

function assertLegacySceneCommandTarget() {
    const openedScenePath = useEditorStore.getState().openedScenePath;
    const compilerDocument = getCompilerSceneDocument();
    if (openedScenePath && compilerDocument?.scenePath === openedScenePath) {
        throw new Error('The currently open Scene uses Pixifact compiler XML; legacy SceneCommand live tools cannot edit it.');
    }
}

async function saveCurrentScene() {
    assertLegacySceneCommandTarget();
    const store = useEditorStore.getState();
    const projectTree = store.projectTree;
    const openedScenePath = store.openedScenePath;
    if (!projectTree || !openedScenePath) {
        return false;
    }
    const saved = await saveSceneFile(projectTree, openedScenePath, getSceneDocument());
    if (saved) {
        const refreshedTree = await refreshProjectFileTree(projectTree);
        useEditorStore.getState().refreshProject(refreshedTree, { selectPath: openedScenePath });
        refreshSceneDocument();
    }
    return saved;
}

function dryRunCurrentCommands(commands: SceneCommand[]) {
    assertLegacySceneCommandTarget();
    const document = getSceneDocument();
    const proposal = {
        id: 'cli-live-dry-run',
        prompt: 'CLI live dry run',
        explanation: 'Commands submitted through Pixifact CLI live bridge.',
        commands,
        annotations: [],
        risks: [],
    };
    return dryRunProposal(document.scene, proposal, {
        locks: document.locks,
        designTokens: document.designTokens,
        actions: document.actions,
    });
}

export function createLiveEditorActionHandlers() {
    return {
        async summary(input: unknown) {
            assertRecord(input, 'input');
            const store = useEditorStore.getState();
            if (!store.projectTree) {
                return {
                    connected: true,
                    projectOpened: false,
                    message: 'No project folder is open in the editor.',
                };
            }
            const files = collectProjectFiles(store.projectTree);
            return {
                connected: true,
                projectOpened: true,
                projectName: store.projectName,
                projectRootPath: store.projectTree.projectRootPath ?? store.projectTree.systemPath,
                openedScenePath: store.openedScenePath,
                selectedProjectFilePath: store.selectedProjectFilePath,
                files,
                scenes: files.filter((file) => file.kind === 'scene').map((file) => file.path),
            };
        },

        async 'scene.get'(input: unknown) {
            const args = assertRecord(input, 'input') as ToolInput;
            if (!matchesCurrentScene(args)) {
                throw new Error('The requested Scene is not the currently open Scene in the editor.');
            }
            assertLegacySceneCommandTarget();
            const store = useEditorStore.getState();
            const document = getSceneDocument();
            return {
                connected: true,
                sourceType: 'live-editor',
                scenePath: store.openedScenePath,
                dirty: document.dirty,
                selection: document.selection,
                scene: document.scene,
                summary: summarizeScene(document.scene),
            };
        },

        async 'node.inspect'(input: unknown) {
            const args = assertRecord(input, 'input') as ToolInput;
            if (!matchesCurrentScene(args)) {
                throw new Error('The requested Scene is not the currently open Scene in the editor.');
            }
            assertLegacySceneCommandTarget();
            const nodeId = assertString(args.node, 'node');
            const node = collectDetailedNodes(getSceneDocument().scene.root).find((item) => item.locator === nodeId);
            if (!node) {
                throw new Error(`Node "${nodeId}" was not found.`);
            }
            return node;
        },

        async 'commands.dryRun'(input: unknown) {
            const args = assertRecord(input, 'input') as ToolInput;
            if (!matchesCurrentScene(args)) {
                throw new Error('The requested Scene is not the currently open Scene in the editor.');
            }
            const result = dryRunCurrentCommands(assertCommands(args.commands));
            return {
                ok: result.ok,
                live: true,
                error: result.error,
                ...(!result.ok ? commandFailureDetails(result.proposal.commands, result.results, result.error) : {}),
                diffs: result.diffs,
                warnings: result.warnings,
                results: result.results,
                scene: result.scene,
            };
        },

        async 'commands.apply'(input: unknown) {
            const args = assertRecord(input, 'input') as ToolInput;
            if (!matchesCurrentScene(args)) {
                throw new Error('The requested Scene is not the currently open Scene in the editor.');
            }
            const commands = assertCommands(args.commands);
            const dryRun = dryRunCurrentCommands(commands);
            if (!dryRun.ok) {
                return {
                    ok: false,
                    live: true,
                    error: dryRun.error,
                    ...commandFailureDetails(commands, dryRun.results, dryRun.error),
                    diffs: dryRun.diffs,
                    warnings: dryRun.warnings,
                    results: dryRun.results,
                };
            }

            const document = getSceneDocument();
            const results: CommandResult[] = [];
            for (const command of commands) {
                const result = document.apply(command, 'ai');
                results.push(result);
                if (!result.ok) {
                    return {
                        ok: false,
                        live: true,
                        error: result.error,
                        ...commandFailureDetails(commands, results, result.error),
                        results,
                    };
                }
            }
            refreshSceneDocument();
            const saved = await saveCurrentScene();
            return {
                ok: true,
                live: true,
                saved,
                scenePath: useEditorStore.getState().openedScenePath,
                diffs: dryRun.diffs,
                warnings: dryRun.warnings,
                results,
                summary: summarizeScene(document.scene),
            };
        },

        async 'commands.validate'(input: unknown) {
            const args = assertRecord(input, 'input') as ToolInput;
            if (!matchesCurrentScene(args)) {
                throw new Error('The requested Scene is not the currently open Scene in the editor.');
            }
            assertLegacySceneCommandTarget();
            const commands = assertCommands(args.commands);
            const draft = structuredClone(getSceneDocument().scene);
            const results: CommandResult[] = [];
            for (const command of commands) {
                const result = applyCommand(draft, command, {
                    actions: getSceneDocument().actions,
                });
                results.push(result);
                if (!result.ok) {
                    return {
                        ok: false,
                        live: true,
                        error: result.error,
                        ...commandFailureDetails(commands, results, result.error),
                        results,
                    };
                }
            }
            return {
                ok: true,
                live: true,
                results,
            };
        },

        async 'template.add.dryRun'(input: unknown) {
            const args = assertRecord(input, 'input') as ToolInput;
            if (!matchesCurrentScene(args)) {
                throw new Error('The requested Scene is not the currently open Scene in the editor.');
            }
            const commands = templateCommands(args);
            const result = dryRunCurrentCommands(commands);
            return {
                ok: result.ok,
                live: true,
                error: result.error,
                ...(!result.ok ? commandFailureDetails(commands, result.results, result.error) : {}),
                commands,
                diffs: result.diffs,
                warnings: result.warnings,
                results: result.results,
                scene: result.scene,
            };
        },

        async 'template.add.apply'(input: unknown) {
            const args = assertRecord(input, 'input') as ToolInput;
            if (!matchesCurrentScene(args)) {
                throw new Error('The requested Scene is not the currently open Scene in the editor.');
            }
            const commands = templateCommands(args);
            const dryRun = dryRunCurrentCommands(commands);
            if (!dryRun.ok) {
                return {
                    ok: false,
                    live: true,
                    error: dryRun.error,
                    ...commandFailureDetails(commands, dryRun.results, dryRun.error),
                    commands,
                    diffs: dryRun.diffs,
                    warnings: dryRun.warnings,
                    results: dryRun.results,
                };
            }

            const document = getSceneDocument();
            const results: CommandResult[] = [];
            for (const command of commands) {
                const result = document.apply(command, 'ai');
                results.push(result);
                if (!result.ok) {
                    return {
                        ok: false,
                        live: true,
                        error: result.error,
                        ...commandFailureDetails(commands, results, result.error),
                        commands,
                        results,
                    };
                }
            }
            refreshSceneDocument();
            const saved = await saveCurrentScene();
            return {
                ok: true,
                live: true,
                saved,
                scenePath: useEditorStore.getState().openedScenePath,
                commands,
                diffs: dryRun.diffs,
                warnings: dryRun.warnings,
                results,
                summary: summarizeScene(document.scene),
            };
        },
    };
}

export function startLiveEditorAgentClient() {
    if (typeof window === 'undefined') {
        return () => {};
    }

    let socket: WebSocket | undefined;
    let stopped = false;
    let reconnectTimer: number | undefined;
    const handlers = createLiveEditorActionHandlers();

    function send(message: LiveBridgeClientMessage) {
        if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(message));
        }
    }

    async function handleRequest(message: LiveBridgeRequestMessage) {
        const handler = handlers[message.action as keyof typeof handlers];
        if (!handler) {
            send({
                type: 'response',
                id: message.id,
                ok: false,
                error: `Unknown action "${message.action}".`,
            });
            return;
        }

        try {
            const result = await handler(message.arguments);
            send({
                type: 'response',
                id: message.id,
                ok: true,
                result,
            });
        } catch (error) {
            send({
                type: 'response',
                id: message.id,
                ok: false,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    function scheduleReconnect() {
        if (stopped || reconnectTimer !== undefined) {
            return;
        }
        reconnectTimer = window.setTimeout(() => {
            reconnectTimer = undefined;
            connect();
        }, 1000);
    }

    function connect() {
        socket = new WebSocket(pixifactAgentBridgeUrl);
        socket.addEventListener('open', () => {
            send({
                type: 'hello',
                role: 'editor',
            });
        });
        socket.addEventListener('message', (event) => {
            const message = JSON.parse(String(event.data)) as LiveBridgeServerMessage;
            if (message.type === 'request') {
                void handleRequest(message);
            }
        });
        socket.addEventListener('close', scheduleReconnect);
        socket.addEventListener('error', () => {
            socket?.close();
        });
    }

    connect();
    return () => {
        stopped = true;
        if (reconnectTimer !== undefined) {
            window.clearTimeout(reconnectTimer);
        }
        socket?.close();
    };
}
