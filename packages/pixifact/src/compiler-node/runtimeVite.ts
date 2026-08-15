import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    pixifactRuntimeProtocolVersion,
    type RuntimeHmrResponse,
    type RuntimeObservationRequest,
    type RuntimePageDescriptor,
    type RuntimeRequest,
} from '../runtime-dev/protocol';

export const runtimeSessionProtocolVersion = pixifactRuntimeProtocolVersion;

const runtimeAnnounceEvent = 'pixifact:runtime:announce';
const runtimeRequestEvent = 'pixifact:runtime:request';
const runtimeResponseEvent = 'pixifact:runtime:response';
const runtimeApiRoot = '/__pixifact_runtime__';
const runtimeScreenshotPath = `${runtimeApiRoot}/screenshot`;
const virtualRuntimeClientId = 'virtual:pixifact-runtime-client';
const resolvedVirtualRuntimeClientId = `\0${virtualRuntimeClientId}`;
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export interface RuntimeSessionDescriptor {
    protocolVersion: typeof runtimeSessionProtocolVersion;
    projectRoot: string;
    pid: number;
    origin: string;
    token: string;
}

export interface RuntimeHostBrowserSocket {
    send(event: string, data: unknown): void;
}

interface RuntimeHostSessionOptions {
    projectRoot: string;
    requestTimeoutMs?: number;
    token: string;
    now?: () => Date;
}

interface RuntimeSessionLookupOptions {
    projectRoot: string;
    sessionsRoot?: string;
    fetch?: typeof fetch;
}

interface ClaimRuntimeSessionOptions extends RuntimeSessionLookupOptions {
    descriptor: RuntimeSessionDescriptor;
}

export interface PixifactRuntimePluginOptions {
    projectRoot?: string | URL;
}

interface RuntimeViteClient extends RuntimeHostBrowserSocket {
    socket: {
        once(event: 'close', listener: () => void): void;
    };
}

interface RuntimeViteServer {
    config: {
        server: { https?: unknown };
        logger: { error(message: string): void };
    };
    httpServer: Server | null;
    middlewares: {
        use(handler: (
            request: IncomingMessage,
            response: ServerResponse,
            next: (error?: unknown) => void,
        ) => void): void;
    };
    ws: {
        on(event: string, listener: (data: unknown, client: RuntimeViteClient) => void): void;
    };
}

interface ConnectedRuntime extends RuntimePageDescriptor {
    connectedAt: string;
    socket: RuntimeHostBrowserSocket;
}

interface PendingRuntimeRequest {
    resolve(response: Response): void;
    runtimeId: string;
    socket: RuntimeHostBrowserSocket;
    responseType: 'json' | 'screenshot';
    timeout: ReturnType<typeof setTimeout>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonResponse(value: unknown, status = 200) {
    return Response.json(value, { status });
}

function authorizationMatches(request: Request, token: string) {
    return request.headers.get('authorization') === `Bearer ${token}`;
}

function isRuntimePageDescriptor(value: unknown): value is RuntimePageDescriptor {
    return isRecord(value)
        && typeof value.runtimeId === 'string'
        && value.runtimeId.length > 0
        && typeof value.url === 'string'
        && typeof value.title === 'string'
        && typeof value.ready === 'boolean';
}

function isRuntimeHmrResponse(value: unknown): value is RuntimeHmrResponse {
    if (
        !isRecord(value)
        || typeof value.requestId !== 'string'
        || typeof value.runtimeId !== 'string'
        || typeof value.ok !== 'boolean'
    ) {
        return false;
    }
    return value.ok ? 'result' in value : typeof value.error === 'string';
}

function isRuntimeRequest(value: unknown): value is RuntimeObservationRequest {
    if (!isRecord(value) || typeof value.type !== 'string') return false;
    if (value.type === 'tree' || value.type === 'state') return true;
    if (value.type === 'node') return Number.isInteger(value.uid) && Number(value.uid) >= 0;
    if (value.type === 'logs') {
        return (value.after === undefined || (Number.isInteger(value.after) && Number(value.after) >= 0))
            && (value.level === undefined || ['debug', 'log', 'info', 'warn', 'error'].includes(String(value.level)));
    }
    if (value.type !== 'input' || typeof value.action !== 'string') return false;
    if (value.action === 'click' || value.action === 'move') {
        return typeof value.x === 'number' && typeof value.y === 'number';
    }
    return ['key', 'keydown', 'keyup'].includes(value.action)
        && typeof value.key === 'string'
        && value.key.length > 0;
}

function runtimeScreenshotResult(value: unknown) {
    if (
        !isRecord(value)
        || typeof value.runtimeId !== 'string'
        || !Number.isInteger(value.width)
        || Number(value.width) <= 0
        || !Number.isInteger(value.height)
        || Number(value.height) <= 0
        || typeof value.dataUrl !== 'string'
    ) {
        return undefined;
    }
    const match = value.dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/);
    const png = match ? Buffer.from(match[1], 'base64') : undefined;
    if (!png || !png.subarray(0, pngSignature.length).equals(pngSignature)) return undefined;
    return {
        runtimeId: value.runtimeId,
        width: Number(value.width),
        height: Number(value.height),
        png,
    };
}

export function createRuntimeHostSession(options: RuntimeHostSessionOptions) {
    const requestTimeoutMs = options.requestTimeoutMs ?? 5_000;
    const now = options.now ?? (() => new Date());
    const sockets = new Set<RuntimeHostBrowserSocket>();
    const runtimeIdBySocket = new Map<RuntimeHostBrowserSocket, string>();
    const runtimes = new Map<string, ConnectedRuntime>();
    const pending = new Map<string, PendingRuntimeRequest>();
    let requestSequence = 0;

    function settle(requestId: string, response: Response) {
        const current = pending.get(requestId);
        if (!current) return;
        pending.delete(requestId);
        clearTimeout(current.timeout);
        current.resolve(response);
    }

    function removeSocketRuntime(socket: RuntimeHostBrowserSocket) {
        const runtimeId = runtimeIdBySocket.get(socket);
        if (!runtimeId) return;
        runtimeIdBySocket.delete(socket);
        if (runtimes.get(runtimeId)?.socket === socket) runtimes.delete(runtimeId);
    }

    function open(socket: RuntimeHostBrowserSocket) {
        sockets.add(socket);
    }

    function close(socket: RuntimeHostBrowserSocket) {
        sockets.delete(socket);
        removeSocketRuntime(socket);
        for (const [requestId, current] of pending) {
            if (current.socket === socket) {
                settle(requestId, jsonResponse({
                    ok: false,
                    error: 'Pixifact Runtime page disconnected during the request.',
                }, 409));
            }
        }
    }

    function forwardRequest(
        runtime: ConnectedRuntime,
        request: RuntimeRequest,
        responseType: PendingRuntimeRequest['responseType'],
    ) {
        const requestId = `runtime-${++requestSequence}`;
        return new Promise<Response>((resolve) => {
            const timeout = setTimeout(() => {
                settle(requestId, jsonResponse({
                    ok: false,
                    error: 'Pixifact Runtime request timed out.',
                }, 504));
            }, requestTimeoutMs);
            pending.set(requestId, {
                resolve,
                runtimeId: runtime.runtimeId,
                socket: runtime.socket,
                responseType,
                timeout,
            });
            runtime.socket.send(runtimeRequestEvent, {
                requestId,
                runtimeId: runtime.runtimeId,
                request,
            });
        });
    }

    function message(socket: RuntimeHostBrowserSocket, event: string, data: unknown) {
        if (!sockets.has(socket)) return;
        if (event === runtimeAnnounceEvent) {
            if (!isRuntimePageDescriptor(data)) {
                throw new Error('Pixifact Runtime page descriptor is invalid.');
            }
            const previousId = runtimeIdBySocket.get(socket);
            const previous = runtimes.get(data.runtimeId);
            if (previousId && previousId !== data.runtimeId) runtimes.delete(previousId);
            if (previous && previous.socket !== socket) runtimeIdBySocket.delete(previous.socket);
            runtimeIdBySocket.set(socket, data.runtimeId);
            runtimes.set(data.runtimeId, {
                ...data,
                connectedAt: previous?.connectedAt ?? now().toISOString(),
                socket,
            });
            return;
        }
        if (event !== runtimeResponseEvent || !isRuntimeHmrResponse(data)) return;
        const current = pending.get(data.requestId);
        if (!current || current.socket !== socket || current.runtimeId !== data.runtimeId) return;
        if (!data.ok) {
            settle(data.requestId, jsonResponse({ ok: false, error: data.error }, 422));
            return;
        }
        if (current.responseType === 'json') {
            settle(data.requestId, jsonResponse(data.result));
            return;
        }
        const screenshot = runtimeScreenshotResult(data.result);
        if (!screenshot) {
            settle(data.requestId, jsonResponse({
                ok: false,
                error: 'Pixifact Runtime returned invalid screenshot data.',
            }, 502));
            return;
        }
        if (screenshot.runtimeId !== data.runtimeId) {
            settle(data.requestId, jsonResponse({
                ok: false,
                error: 'Pixifact Runtime returned a screenshot for a different runtime.',
            }, 502));
            return;
        }
        settle(data.requestId, new Response(screenshot.png, {
            headers: {
                'cache-control': 'no-store',
                'content-type': 'image/png',
                'x-pixifact-height': String(screenshot.height),
                'x-pixifact-runtime': screenshot.runtimeId,
                'x-pixifact-width': String(screenshot.width),
            },
        }));
    }

    async function fetchRequest(request: Request) {
        const pathname = new URL(request.url).pathname;
        if (!pathname.startsWith(`${runtimeApiRoot}/`)) return undefined;
        if (!authorizationMatches(request, options.token)) {
            return jsonResponse({
                ok: false,
                error: 'Pixifact Runtime session token is invalid.',
            }, 401);
        }
        if (pathname === `${runtimeApiRoot}/health`) {
            return jsonResponse({
                protocolVersion: runtimeSessionProtocolVersion,
                projectRoot: options.projectRoot,
            });
        }
        if (pathname === `${runtimeApiRoot}/list`) {
            return jsonResponse({
                ok: true,
                runtimes: [...runtimes.values()]
                    .map(({ socket: _socket, ...runtime }) => runtime)
                    .sort((left, right) => left.connectedAt.localeCompare(right.connectedAt)),
            });
        }
        if (pathname === runtimeScreenshotPath) {
            if (request.method !== 'POST') {
                return jsonResponse({ ok: false, error: 'Pixifact Runtime screenshot requests require POST.' }, 405);
            }
            const body = await request.json() as unknown;
            if (!isRecord(body) || typeof body.runtimeId !== 'string') {
                return jsonResponse({ ok: false, error: 'Pixifact Runtime screenshot request is invalid.' }, 400);
            }
            const runtime = runtimes.get(body.runtimeId);
            if (!runtime) {
                return jsonResponse({
                    ok: false,
                    error: `Pixifact Runtime "${body.runtimeId}" is not connected.`,
                }, 404);
            }
            return forwardRequest(runtime, { type: 'screenshot' }, 'screenshot');
        }
        if (pathname !== `${runtimeApiRoot}/request`) return undefined;
        if (request.method !== 'POST') {
            return jsonResponse({ ok: false, error: 'Pixifact Runtime requests require POST.' }, 405);
        }
        const body = await request.json() as unknown;
        if (!isRecord(body) || typeof body.runtimeId !== 'string' || !isRuntimeRequest(body.request)) {
            return jsonResponse({ ok: false, error: 'Pixifact Runtime request is invalid.' }, 400);
        }
        const runtime = runtimes.get(body.runtimeId);
        if (!runtime) {
            return jsonResponse({
                ok: false,
                error: `Pixifact Runtime "${body.runtimeId}" is not connected.`,
            }, 404);
        }
        return forwardRequest(runtime, body.request, 'json');
    }

    return {
        open,
        close,
        message,
        fetch: fetchRequest,
    };
}

export function defaultRuntimeSessionsRoot() {
    return path.join(os.tmpdir(), 'pixifact', 'runtime-sessions');
}

export function runtimeSessionDescriptorPath(
    projectRoot: string,
    sessionsRoot = defaultRuntimeSessionsRoot(),
) {
    const canonicalRoot = fs.realpathSync(projectRoot);
    const projectHash = createHash('sha256').update(canonicalRoot).digest('hex');
    return path.join(sessionsRoot, `${projectHash}.json`);
}

function isLoopbackOrigin(origin: string) {
    const hostname = new URL(origin).hostname;
    return hostname === 'localhost' || hostname === '::1' || hostname.startsWith('127.');
}

function validateRuntimeSessionDescriptor(value: unknown): RuntimeSessionDescriptor {
    if (
        !isRecord(value)
        || value.protocolVersion !== runtimeSessionProtocolVersion
        || typeof value.projectRoot !== 'string'
        || typeof value.pid !== 'number'
        || typeof value.origin !== 'string'
        || typeof value.token !== 'string'
        || !isLoopbackOrigin(value.origin)
    ) {
        throw new Error('Pixifact Runtime session descriptor is invalid.');
    }
    return value as unknown as RuntimeSessionDescriptor;
}

export function readRuntimeSessionDescriptor(
    projectRoot: string,
    sessionsRoot = defaultRuntimeSessionsRoot(),
) {
    const descriptorPath = runtimeSessionDescriptorPath(projectRoot, sessionsRoot);
    if (!fs.existsSync(descriptorPath)) return undefined;
    return validateRuntimeSessionDescriptor(JSON.parse(fs.readFileSync(descriptorPath, 'utf8')));
}

export function writeRuntimeSessionDescriptor(
    descriptor: RuntimeSessionDescriptor,
    sessionsRoot = defaultRuntimeSessionsRoot(),
) {
    const canonicalRoot = fs.realpathSync(descriptor.projectRoot);
    const stored = validateRuntimeSessionDescriptor({ ...descriptor, projectRoot: canonicalRoot });
    fs.mkdirSync(sessionsRoot, { recursive: true, mode: 0o700 });
    fs.writeFileSync(
        runtimeSessionDescriptorPath(canonicalRoot, sessionsRoot),
        `${JSON.stringify(stored, null, 2)}\n`,
        { encoding: 'utf8', flag: 'wx', mode: 0o600 },
    );
}

export function removeRuntimeSessionDescriptor(
    descriptor: RuntimeSessionDescriptor,
    sessionsRoot = defaultRuntimeSessionsRoot(),
) {
    const descriptorPath = runtimeSessionDescriptorPath(descriptor.projectRoot, sessionsRoot);
    if (!fs.existsSync(descriptorPath)) return;
    const current = readRuntimeSessionDescriptor(descriptor.projectRoot, sessionsRoot);
    if (current?.token === descriptor.token) fs.unlinkSync(descriptorPath);
}

function validateRuntimeHealth(value: unknown) {
    if (
        !isRecord(value)
        || value.protocolVersion !== runtimeSessionProtocolVersion
        || typeof value.projectRoot !== 'string'
    ) {
        throw new Error('Pixifact Runtime Host health response is invalid.');
    }
    return value as { protocolVersion: number; projectRoot: string };
}

export async function findActiveRuntimeSession(options: RuntimeSessionLookupOptions) {
    const projectRoot = fs.realpathSync(options.projectRoot);
    const descriptor = readRuntimeSessionDescriptor(projectRoot, options.sessionsRoot);
    if (!descriptor) return undefined;
    if (descriptor.projectRoot !== projectRoot) {
        throw new Error('Pixifact Runtime session belongs to a different project.');
    }
    const fetcher = options.fetch ?? fetch;
    try {
        const response = await fetcher(`${descriptor.origin}${runtimeApiRoot}/health`, {
            headers: { authorization: `Bearer ${descriptor.token}` },
        });
        if (!response.ok) return undefined;
        const health = validateRuntimeHealth(await response.json());
        if (health.projectRoot !== projectRoot) {
            throw new Error('Pixifact Runtime Host health check returned a different project.');
        }
        return descriptor;
    } catch (error) {
        if (error instanceof Error && error.message.includes('different project')) throw error;
        return undefined;
    }
}

export async function claimRuntimeSession(options: ClaimRuntimeSessionOptions) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const current = readRuntimeSessionDescriptor(options.projectRoot, options.sessionsRoot);
        const active = await findActiveRuntimeSession(options);
        if (active) return { descriptor: active, owned: false as const };
        if (current) removeRuntimeSessionDescriptor(current, options.sessionsRoot);
        try {
            writeRuntimeSessionDescriptor(options.descriptor, options.sessionsRoot);
            return { descriptor: options.descriptor, owned: true as const };
        } catch (error) {
            if (!isRecord(error) || error.code !== 'EEXIST') throw error;
        }
    }
    throw new Error('Pixifact Runtime session could not be registered.');
}

function projectRootPath(projectRoot: string | URL | undefined, viteRoot: string) {
    if (typeof projectRoot === 'string') return projectRoot;
    if (projectRoot) return fileURLToPath(projectRoot);
    return viteRoot;
}

function serverOrigin(server: RuntimeViteServer) {
    const address = server.httpServer?.address();
    if (!address || typeof address === 'string') {
        throw new Error('Pixifact Runtime requires a listening Vite HTTP server.');
    }
    if (!(address.address === '::1' || address.address.startsWith('127.'))) {
        throw new Error('Pixifact Runtime requires the Vite server to bind to a loopback address.');
    }
    const hostname = address.address === '::1' ? '[::1]' : address.address;
    const protocol = server.config.server.https ? 'https' : 'http';
    return `${protocol}://${hostname}:${address.port}`;
}

async function webRequestFromNode(request: IncomingMessage, origin: string) {
    const chunks: Uint8Array[] = [];
    for await (const chunk of request) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
    return new Request(new URL(request.url ?? '/', origin), {
        method: request.method,
        headers: request.headers as HeadersInit,
        ...(body ? { body } : {}),
    });
}

async function writeNodeResponse(response: ServerResponse, result: Response) {
    response.statusCode = result.status;
    result.headers.forEach((value, name) => response.setHeader(name, value));
    response.end(Buffer.from(await result.arrayBuffer()));
}

export function pixifactRuntimePlugin(options: PixifactRuntimePluginOptions = {}) {
    let projectRoot = '';
    const token = randomBytes(32).toString('hex');

    return {
        name: 'pixifact-runtime',
        apply: 'serve',
        configResolved(config: { root: string }) {
            projectRoot = fs.realpathSync(projectRootPath(options.projectRoot, config.root));
        },
        resolveId(id: string) {
            return id === virtualRuntimeClientId ? resolvedVirtualRuntimeClientId : undefined;
        },
        load(id: string) {
            if (id !== resolvedVirtualRuntimeClientId) return undefined;
            return [
                "const runtimeHotKey = Symbol.for('pixifact.runtime.hot');",
                'globalThis[runtimeHotKey] = import.meta.hot;',
                "await import('pixifact/runtime-dev');",
                'delete globalThis[runtimeHotKey];',
            ].join('\n');
        },
        transformIndexHtml() {
            return [{
                tag: 'script',
                attrs: {
                    type: 'module',
                    src: `/@id/${virtualRuntimeClientId}`,
                },
                injectTo: 'head-prepend' as const,
            }];
        },
        configureServer(server: RuntimeViteServer) {
            const host = createRuntimeHostSession({ projectRoot, token });
            const openedClients = new WeakSet<RuntimeViteClient>();

            function openClient(client: RuntimeViteClient) {
                if (openedClients.has(client)) return;
                openedClients.add(client);
                host.open(client);
                client.socket.once('close', () => host.close(client));
            }

            server.ws.on(runtimeAnnounceEvent, (data, client) => {
                openClient(client);
                host.message(client, runtimeAnnounceEvent, data);
            });
            server.ws.on(runtimeResponseEvent, (data, client) => {
                openClient(client);
                host.message(client, runtimeResponseEvent, data);
            });
            server.middlewares.use((request, response, next) => {
                void (async () => {
                    const webRequest = await webRequestFromNode(request, serverOrigin(server));
                    const result = await host.fetch(webRequest);
                    if (!result) {
                        next();
                        return;
                    }
                    await writeNodeResponse(response, result);
                })().catch(next);
            });

            const httpServer = server.httpServer;
            if (!httpServer) throw new Error('Pixifact Runtime requires the Vite HTTP server.');
            let descriptor: RuntimeSessionDescriptor | undefined;
            httpServer.once('listening', () => {
                void (async () => {
                    const candidate: RuntimeSessionDescriptor = {
                        protocolVersion: runtimeSessionProtocolVersion,
                        projectRoot,
                        pid: process.pid,
                        origin: serverOrigin(server),
                        token,
                    };
                    const claim = await claimRuntimeSession({ projectRoot, descriptor: candidate });
                    if (!claim.owned) {
                        throw new Error('Another Pixifact Runtime Vite server is already running for this project.');
                    }
                    descriptor = candidate;
                })().catch((error: unknown) => {
                    server.config.logger.error(error instanceof Error ? error.message : String(error));
                });
            });
            httpServer.once('close', () => {
                if (descriptor) removeRuntimeSessionDescriptor(descriptor);
            });
        },
    };
}
