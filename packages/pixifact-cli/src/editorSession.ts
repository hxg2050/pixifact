import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseSceneTemplate } from 'pixifact/compiler';

export const editorSessionProtocolVersion = 2;

export type EditorContextSyncState = 'synced' | 'saving' | 'conflict' | 'error';

export type EditorNodeContext =
    | {
        kind: 'pixi';
        type: string;
        id?: string;
        props: Record<string, unknown>;
        childCount: number;
    }
    | {
        kind: 'sceneInstance';
        type: string;
        id?: string;
        scene: string;
        props: Record<string, unknown>;
        events: Record<string, string>;
        slots: Record<string, number>;
    }
    | {
        kind: 'slotOutlet';
        name: string;
    };

export type EditorSelectionContext =
    | { kind: 'scene' }
    | {
        kind: 'node';
        locator: string;
        node: EditorNodeContext;
    };

export interface EditorBrowserContext {
    scene: {
        path: string;
        revision: string;
        syncState: EditorContextSyncState;
    };
    selection: EditorSelectionContext;
}

export interface EditorSessionResumeState {
    scenePath: string;
    selectedLocator?: string;
}

export interface EditorContext extends EditorBrowserContext {
    protocolVersion: typeof editorSessionProtocolVersion;
    projectRoot: string;
    editor: {
        connected: true;
        updatedAt: string;
    };
}

export interface EditorSessionDescriptor {
    protocolVersion: typeof editorSessionProtocolVersion;
    projectRoot: string;
    pid: number;
    origin: string;
    token: string;
}

interface EditorBrowserSocket {
    send(data: string): void;
}

interface EditorHostSessionOptions {
    projectRoot: string;
    token: string;
    now?: () => Date;
}

interface EditorSessionLookupOptions {
    projectRoot: string;
    sessionsRoot?: string;
    fetch?: typeof fetch;
}

interface ClaimEditorSessionOptions extends EditorSessionLookupOptions {
    descriptor: EditorSessionDescriptor;
}

function jsonResponse(value: unknown, status = 200) {
    return Response.json(value, { status });
}

function sceneVersion(source: string) {
    return `sha256:${createHash('sha256').update(source).digest('hex')}`;
}

function authorizationMatches(request: Request, token: string) {
    return request.headers.get('authorization') === `Bearer ${token}`;
}

function resolveScenePath(projectRoot: string, scenePath: string) {
    if (!scenePath || path.isAbsolute(scenePath) || path.extname(scenePath).toLowerCase() !== '.scene') {
        throw new Error('Editor context Scene path must be a project-relative .scene file.');
    }
    const absolutePath = fs.realpathSync(path.resolve(projectRoot, scenePath));
    if (absolutePath !== projectRoot && !absolutePath.startsWith(`${projectRoot}${path.sep}`)) {
        throw new Error('Editor context Scene path must stay inside the project root.');
    }
    return absolutePath;
}

function sourcePosition(message: string, source: string) {
    const match = message.match(/\boffset (\d+)\b/);
    if (!match) {
        return {};
    }
    const offset = Number(match[1]);
    const lines = source.slice(0, offset).split('\n');
    return {
        line: lines.length,
        column: lines.at(-1)!.length + 1,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEditorBrowserContext(value: unknown): value is EditorBrowserContext {
    if (!isRecord(value) || !isRecord(value.scene) || !isRecord(value.selection)) {
        return false;
    }
    const syncState = value.scene.syncState;
    if (
        typeof value.scene.path !== 'string'
        || typeof value.scene.revision !== 'string'
        || !['synced', 'saving', 'conflict', 'error'].includes(String(syncState))
    ) {
        return false;
    }
    if (value.selection.kind === 'scene') {
        return true;
    }
    return value.selection.kind === 'node'
        && typeof value.selection.locator === 'string'
        && isRecord(value.selection.node);
}

export function createEditorHostSession(options: EditorHostSessionOptions) {
    const projectRoot = fs.realpathSync(options.projectRoot);
    const now = options.now ?? (() => new Date());
    const browsers = new Set<EditorBrowserSocket>();
    let activeBrowser: EditorBrowserSocket | undefined;
    let context: EditorContext | undefined;
    let resume: EditorSessionResumeState | undefined;

    function sendState(
        socket: EditorBrowserSocket,
        type: 'editorSessionActive' | 'editorSessionStandby',
        details: { error?: string; reason?: 'takenOver' } = {},
    ) {
        socket.send(JSON.stringify({
            type,
            protocolVersion: editorSessionProtocolVersion,
            ...details,
            ...(resume ? { resume } : {}),
        }));
    }

    function notifyStandbyBrowsers() {
        for (const socket of browsers) {
            if (socket !== activeBrowser) sendState(socket, 'editorSessionStandby');
        }
    }

    function open(socket: EditorBrowserSocket) {
        browsers.add(socket);
        if (activeBrowser) {
            sendState(socket, 'editorSessionStandby');
            return false;
        }
        activeBrowser = socket;
        sendState(socket, 'editorSessionActive');
        return true;
    }

    function close(socket: EditorBrowserSocket) {
        browsers.delete(socket);
        if (socket === activeBrowser) {
            activeBrowser = undefined;
            context = undefined;
        }
    }

    function message(socket: EditorBrowserSocket, data: string | ArrayBuffer | Uint8Array) {
        const parsed = JSON.parse(String(data)) as Record<string, unknown>;
        if (parsed.protocolVersion !== editorSessionProtocolVersion) {
            throw new Error('Editor session protocol version does not match. Restart Pixifact Editor.');
        }
        if (parsed.type === 'editorSessionTakeoverRequested') {
            if (!browsers.has(socket) || socket === activeBrowser) return;
            if (activeBrowser && context?.scene.syncState !== 'synced') {
                sendState(socket, 'editorSessionStandby', {
                    error: '当前 Editor 尚未同步，暂时无法接管。',
                });
                return;
            }
            const previous = activeBrowser;
            activeBrowser = socket;
            context = undefined;
            for (const browser of browsers) {
                if (browser === socket) {
                    sendState(browser, 'editorSessionActive');
                } else {
                    sendState(browser, 'editorSessionStandby', {
                        ...(browser === previous ? { reason: 'takenOver' as const } : {}),
                    });
                }
            }
            return;
        }
        if (socket !== activeBrowser || parsed.type !== 'editorContextChanged') return;
        if (!isEditorBrowserContext(parsed.context)) {
            throw new Error('Editor context message is invalid.');
        }
        context = {
            protocolVersion: editorSessionProtocolVersion,
            projectRoot,
            editor: {
                connected: true,
                updatedAt: now().toISOString(),
            },
            ...structuredClone(parsed.context),
        };
        resume = {
            scenePath: context.scene.path,
            ...(context.selection.kind === 'node'
                ? { selectedLocator: context.selection.locator }
                : {}),
        };
        notifyStandbyBrowsers();
    }

    function contextResponse() {
        if (!activeBrowser) {
            return jsonResponse({
                ok: false,
                error: 'No active Editor browser session.',
            }, 409);
        }
        if (!context) {
            return jsonResponse({
                ok: false,
                error: 'Editor context is not ready.',
            }, 409);
        }
        if (context.scene.syncState !== 'synced') {
            return jsonResponse({
                ok: false,
                error: 'Editor Scene is not synchronized.',
                syncState: context.scene.syncState,
            }, 409);
        }

        const source = fs.readFileSync(resolveScenePath(projectRoot, context.scene.path), 'utf8');
        const revision = sceneVersion(source);
        if (revision !== context.scene.revision) {
            try {
                parseSceneTemplate(source);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return jsonResponse({
                    ok: false,
                    error: 'Scene parsing failed.',
                    scene: {
                        path: context.scene.path,
                        revision,
                    },
                    diagnostics: [{
                        path: '__scene__',
                        prop: 'source',
                        expected: 'valid Pixifact .scene source',
                        actual: message,
                        ...sourcePosition(message, source),
                    }],
                }, 422);
            }
            return jsonResponse({
                ok: false,
                error: 'Editor context is updating.',
                scene: {
                    path: context.scene.path,
                    revision,
                },
            }, 409);
        }
        return jsonResponse(context);
    }

    function fetchRequest(request: Request) {
        const pathname = new URL(request.url).pathname;
        if (pathname !== '/api/editor-session/health' && pathname !== '/api/editor-context') {
            return undefined;
        }
        if (!authorizationMatches(request, options.token)) {
            return jsonResponse({ ok: false, error: 'Editor session token is invalid.' }, 401);
        }
        if (pathname === '/api/editor-session/health') {
            return jsonResponse({
                protocolVersion: editorSessionProtocolVersion,
                projectRoot,
            });
        }
        return contextResponse();
    }

    function notifyProjectFileChanged(changedPath: string) {
        activeBrowser?.send(JSON.stringify({ type: 'projectFileChanged', path: changedPath }));
    }

    return {
        open,
        close,
        message,
        fetch: fetchRequest,
        notifyProjectFileChanged,
    };
}

export function defaultEditorSessionsRoot() {
    return path.join(os.tmpdir(), 'pixifact', 'editor-sessions');
}

export function editorSessionDescriptorPath(projectRoot: string, sessionsRoot = defaultEditorSessionsRoot()) {
    const canonicalRoot = fs.realpathSync(projectRoot);
    const projectHash = createHash('sha256').update(canonicalRoot).digest('hex');
    return path.join(sessionsRoot, `${projectHash}.json`);
}

function validateDescriptor(value: unknown): EditorSessionDescriptor {
    if (
        !isRecord(value)
        || typeof value.protocolVersion !== 'number'
        || typeof value.projectRoot !== 'string'
        || typeof value.pid !== 'number'
        || typeof value.origin !== 'string'
        || typeof value.token !== 'string'
    ) {
        throw new Error('Pixifact Editor session descriptor is invalid.');
    }
    if (value.protocolVersion !== editorSessionProtocolVersion) {
        throw new Error('Editor session protocol version does not match. Restart Pixifact Editor.');
    }
    return value as unknown as EditorSessionDescriptor;
}

export function readEditorSessionDescriptor(projectRoot: string, sessionsRoot = defaultEditorSessionsRoot()) {
    const descriptorPath = editorSessionDescriptorPath(projectRoot, sessionsRoot);
    if (!fs.existsSync(descriptorPath)) {
        return undefined;
    }
    return validateDescriptor(JSON.parse(fs.readFileSync(descriptorPath, 'utf8')));
}

export function writeEditorSessionDescriptor(
    descriptor: EditorSessionDescriptor,
    sessionsRoot = defaultEditorSessionsRoot(),
) {
    fs.mkdirSync(sessionsRoot, { recursive: true });
    fs.writeFileSync(
        editorSessionDescriptorPath(descriptor.projectRoot, sessionsRoot),
        `${JSON.stringify(descriptor, null, 2)}\n`,
        { encoding: 'utf8', flag: 'wx', mode: 0o600 },
    );
}

export function removeEditorSessionDescriptor(
    descriptor: EditorSessionDescriptor,
    sessionsRoot = defaultEditorSessionsRoot(),
) {
    const descriptorPath = editorSessionDescriptorPath(descriptor.projectRoot, sessionsRoot);
    if (!fs.existsSync(descriptorPath)) {
        return;
    }
    const current = readEditorSessionDescriptor(descriptor.projectRoot, sessionsRoot);
    if (current?.token === descriptor.token) {
        fs.unlinkSync(descriptorPath);
    }
}

export async function findActiveEditorSession(options: EditorSessionLookupOptions) {
    const projectRoot = fs.realpathSync(options.projectRoot);
    const descriptor = readEditorSessionDescriptor(projectRoot, options.sessionsRoot);
    if (!descriptor) {
        return undefined;
    }
    if (descriptor.projectRoot !== projectRoot) {
        throw new Error('Pixifact Editor session belongs to a different project.');
    }
    const fetcher = options.fetch ?? fetch;
    let response: Response;
    try {
        response = await fetcher(`${descriptor.origin}/api/editor-session/health`, {
            headers: { authorization: `Bearer ${descriptor.token}` },
        });
    } catch {
        return undefined;
    }
    if (!response.ok) {
        return undefined;
    }
    const health = validateDescriptorHealth(await response.json());
    if (health.projectRoot !== projectRoot) {
        throw new Error('Pixifact Editor Host health check returned a different project.');
    }
    return descriptor;
}

function validateDescriptorHealth(value: unknown) {
    if (!isRecord(value) || typeof value.protocolVersion !== 'number' || typeof value.projectRoot !== 'string') {
        throw new Error('Pixifact Editor Host health response is invalid.');
    }
    if (value.protocolVersion !== editorSessionProtocolVersion) {
        throw new Error('Editor session protocol version does not match. Restart Pixifact Editor.');
    }
    return value as { protocolVersion: number; projectRoot: string };
}

export async function claimEditorSession(options: ClaimEditorSessionOptions) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const current = readEditorSessionDescriptor(options.projectRoot, options.sessionsRoot);
        const active = await findActiveEditorSession(options);
        if (active) {
            return { descriptor: active, owned: false as const };
        }
        if (current) {
            removeEditorSessionDescriptor(current, options.sessionsRoot);
        }
        try {
            writeEditorSessionDescriptor(options.descriptor, options.sessionsRoot);
            return { descriptor: options.descriptor, owned: true as const };
        } catch (error) {
            if (!isRecord(error) || error.code !== 'EEXIST') {
                throw error;
            }
        }
    }
    throw new Error('Pixifact Editor session could not be registered.');
}

export async function queryEditorContext(options: EditorSessionLookupOptions) {
    const projectRoot = fs.realpathSync(options.projectRoot);
    const descriptor = readEditorSessionDescriptor(projectRoot, options.sessionsRoot);
    if (!descriptor) {
        return {
            ok: false,
            error: 'No Pixifact Editor Host is running for this project.',
        };
    }
    const fetcher = options.fetch ?? fetch;
    try {
        const response = await fetcher(`${descriptor.origin}/api/editor-context`, {
            headers: { authorization: `Bearer ${descriptor.token}` },
        });
        const result = await response.json() as Record<string, unknown>;
        if (response.ok) {
            if (result.protocolVersion !== editorSessionProtocolVersion) {
                return {
                    ok: false,
                    error: 'Editor session protocol version does not match. Restart Pixifact Editor.',
                };
            }
            if (result.projectRoot !== projectRoot) {
                return {
                    ok: false,
                    error: 'Pixifact Editor context belongs to a different project.',
                };
            }
        }
        return result;
    } catch {
        return {
            ok: false,
            error: 'Pixifact Editor Host is not reachable for this project.',
        };
    }
}
