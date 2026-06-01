import type { NodeSpec, SceneSpec } from 'pixifact';
import { createSceneRevision, inspectSceneTemplate } from '../../../../packages/pixifact/src/compiler/sceneValidation';
import { serializeSceneTemplate } from '../../../../packages/pixifact/src/compiler/templateSerializer';
import type { SceneTemplateNode } from '../../../../packages/pixifact/src/compiler/spec';
import { getSceneDocument } from '../document/sceneDocumentController';
import { compilerSceneNodeLocator, getCompilerSceneDocument } from '../document/compilerSceneDocumentController';
import { useEditorStore } from '../editorStore';
import type { CompilerSceneTemplateNode } from '../services/projectFileTree';
import { getLastExternalSceneSync } from '../services/externalSceneSyncState';
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

type DetailedCompilerNode = SceneTemplateNode & {
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

function compilerNodeChildren(node: CompilerSceneTemplateNode): CompilerSceneTemplateNode[] {
    if (node.kind === 'pixi') {
        return node.children;
    }
    if (node.kind === 'sceneInstance') {
        return Object.values(node.slots).flat();
    }
    return [];
}

function collectDetailedCompilerNodes(
    nodes: CompilerSceneTemplateNode[],
    depth = 0,
    parentLocator = '__scene__',
): DetailedCompilerNode[] {
    return nodes.flatMap((node, index) => {
        const locator = compilerSceneNodeLocator(
            node,
            parentLocator === '__scene__' ? String(index) : `${parentLocator}/${index}`,
        );
        const children = node.kind === 'pixi'
            ? collectDetailedCompilerNodes(node.children, depth + 1, locator)
            : node.kind === 'sceneInstance'
                ? Object.entries(node.slots).flatMap(([slot, children]) => collectDetailedCompilerNodes(children, depth + 1, `${locator}/slot:${slot}`))
                : [];
        return [
            {
                ...structuredClone(node),
                locator,
                depth,
                parent: parentLocator === '__scene__' ? undefined : parentLocator,
                childCount: compilerNodeChildren(node).length,
            },
            ...children,
        ];
    });
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
            const store = useEditorStore.getState();
            const compilerDocument = getCompilerSceneDocument();
            if (store.openedScenePath && compilerDocument?.scenePath === store.openedScenePath) {
                const content = serializeSceneTemplate(compilerDocument.template);
                const lastExternalSync = getLastExternalSceneSync(store.openedScenePath);
                return {
                    connected: true,
                    sourceType: 'compiler-scene',
                    scenePath: store.openedScenePath,
                    dirty: compilerDocument.dirty,
                    revision: createSceneRevision(content),
                    selection: compilerDocument.selection,
                    template: compilerDocument.template,
                    summary: inspectSceneTemplate(compilerDocument.template),
                    ...(lastExternalSync ? { lastExternalSync } : {}),
                };
            }
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
            const nodeId = assertString(args.node, 'node');
            const store = useEditorStore.getState();
            const compilerDocument = getCompilerSceneDocument();
            if (store.openedScenePath && compilerDocument?.scenePath === store.openedScenePath) {
                const node = collectDetailedCompilerNodes(compilerDocument.template.children).find((item) => item.locator === nodeId);
                if (!node) {
                    throw new Error(`Node "${nodeId}" was not found.`);
                }
                return node;
            }
            const node = collectDetailedNodes(getSceneDocument().scene.root).find((item) => item.locator === nodeId);
            if (!node) {
                throw new Error(`Node "${nodeId}" was not found.`);
            }
            return node;
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
