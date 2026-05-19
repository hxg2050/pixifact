import {
    pixifactAgentBridgePath,
    pixifactAgentBridgePort,
    type LiveBridgeClientMessage,
    type LiveBridgeRequestMessage,
    type LiveBridgeResponseMessage,
} from './liveBridge';

interface BunServerSocket {
    send(data: string): void;
}

interface BunServer {
    upgrade(request: Request): boolean;
    stop(force?: boolean): void;
}

interface BunServeOptions {
    hostname: string;
    port: number;
    fetch(request: Request, server: BunServer): Response | undefined;
    websocket: {
        message(socket: BunServerSocket, data: string | Uint8Array): void;
        close(socket: BunServerSocket): void;
    };
}

declare const Bun: {
    serve(options: BunServeOptions): BunServer;
};

interface PendingRequest {
    resolve(result: unknown): void;
    reject(error: Error): void;
    timer: ReturnType<typeof setTimeout>;
}

interface LiveBridgeServerOptions {
    port?: number;
    requestTimeoutMs?: number;
}

function responseError(message: LiveBridgeResponseMessage) {
    return new Error(message.error ?? 'Live editor request failed.');
}

export function createLiveBridgeServer(options: LiveBridgeServerOptions = {}) {
    const port = options.port ?? pixifactAgentBridgePort;
    const requestTimeoutMs = options.requestTimeoutMs ?? 30000;
    let editor: BunServerSocket | undefined;
    const pending = new Map<string, PendingRequest>();
    const connectionWaiters = new Set<() => void>();
    let nextRequestId = 0;

    function rejectPending(error: Error) {
        for (const pendingRequest of pending.values()) {
            clearTimeout(pendingRequest.timer);
            pendingRequest.reject(error);
        }
        pending.clear();
    }

    const server = Bun.serve({
        hostname: '127.0.0.1',
        port,
        fetch(request, server) {
            const url = new URL(request.url);
            if (url.pathname !== pixifactAgentBridgePath) {
                return new Response('Not found.', { status: 404 });
            }
            if (server.upgrade(request)) {
                return undefined;
            }
            return new Response('WebSocket upgrade failed.', { status: 400 });
        },
        websocket: {
            message(socket, data) {
                const message = JSON.parse(String(data)) as LiveBridgeClientMessage;
                if (message.type === 'hello' && message.role === 'editor') {
                    editor = socket;
                    for (const resolve of connectionWaiters) {
                        resolve();
                    }
                    connectionWaiters.clear();
                    return;
                }
                if (message.type !== 'response') {
                    return;
                }
                const pendingRequest = pending.get(message.id);
                if (!pendingRequest) {
                    return;
                }
                pending.delete(message.id);
                clearTimeout(pendingRequest.timer);
                if (message.ok) {
                    pendingRequest.resolve(message.result);
                } else {
                    pendingRequest.reject(responseError(message));
                }
            },
            close(socket) {
                if (socket === editor) {
                    editor = undefined;
                    rejectPending(new Error('Live editor disconnected.'));
                }
            },
        },
    });

    return {
        get connected() {
            return editor !== undefined;
        },

        async waitForConnection(timeoutMs = 3000) {
            if (editor) {
                return;
            }
            return new Promise<void>((resolve, reject) => {
                const timer = setTimeout(() => {
                    connectionWaiters.delete(done);
                    reject(new Error('No live Pixifact editor is connected.'));
                }, timeoutMs);
                function done() {
                    clearTimeout(timer);
                    resolve();
                }
                connectionWaiters.add(done);
            });
        },

        async callAction(action: string, args: unknown) {
            if (!editor) {
                throw new Error('No live Pixifact editor is connected.');
            }
            const id = `live-${Date.now()}-${nextRequestId++}`;
            const message: LiveBridgeRequestMessage = {
                type: 'request',
                id,
                action,
                arguments: args,
            };
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    pending.delete(id);
                    reject(new Error(`Live editor action "${action}" timed out.`));
                }, requestTimeoutMs);
                pending.set(id, {
                    resolve,
                    reject,
                    timer,
                });
                editor!.send(JSON.stringify(message));
            });
        },

        stop() {
            rejectPending(new Error('Live bridge stopped.'));
            server.stop(true);
        },
    };
}
