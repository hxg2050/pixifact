import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseSceneTemplate } from 'pixifact/compiler';

export const editorSessionProtocolVersion = 3;

export type EditorContextSyncState = 'synced' | 'saving' | 'conflict' | 'error';
export type EditorPreviewState = 'loading' | 'ready' | 'error';

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
        previewState: EditorPreviewState;
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
    screenshotTimeoutMs?: number;
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

interface PendingEditorScreenshot {
    browser: EditorBrowserSocket;
    resolve(response: Response): void;
    scene: {
        path: string;
        revision: string;
    };
    timeout: ReturnType<typeof setTimeout>;
}

export interface EditorScreenshotResult {
    ok: true;
    scene: string;
    revision: string;
    width: number;
    height: number;
    data: Uint8Array;
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
        || !['loading', 'ready', 'error'].includes(String(value.scene.previewState))
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
    const screenshotTimeoutMs = options.screenshotTimeoutMs ?? 10_000;
    const browsers = new Set<EditorBrowserSocket>();
    const pendingScreenshots = new Map<string, PendingEditorScreenshot>();
    let activeBrowser: EditorBrowserSocket | undefined;
    let context: EditorContext | undefined;
    let resume: EditorSessionResumeState | undefined;
    let screenshotSequence = 0;

    function settleScreenshot(requestId: string, response: Response) {
        const pending = pendingScreenshots.get(requestId);
        if (!pending) return;
        pendingScreenshots.delete(requestId);
        clearTimeout(pending.timeout);
        pending.resolve(response);
    }

    function rejectBrowserScreenshots(browser: EditorBrowserSocket, error: string) {
        for (const [requestId, pending] of pendingScreenshots) {
            if (pending.browser === browser) {
                settleScreenshot(requestId, jsonResponse({ ok: false, error }, 409));
            }
        }
    }

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
            rejectBrowserScreenshots(socket, 'Active Editor browser disconnected during screenshot capture.');
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
            if (previous) {
                rejectBrowserScreenshots(previous, 'Active Editor browser changed during screenshot capture.');
            }
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
        if (
            socket === activeBrowser
            && (parsed.type === 'editorScreenshotCompleted' || parsed.type === 'editorScreenshotFailed')
        ) {
            const requestId = typeof parsed.requestId === 'string' ? parsed.requestId : '';
            const pending = pendingScreenshots.get(requestId);
            if (!pending || pending.browser !== socket) return;
            if (parsed.type === 'editorScreenshotFailed') {
                const error = typeof parsed.error === 'string'
                    ? parsed.error
                    : 'Editor browser failed to capture the Scene screenshot.';
                settleScreenshot(requestId, jsonResponse({ ok: false, error }, 500));
                return;
            }
            if (
                !isRecord(parsed.scene)
                || parsed.scene.path !== pending.scene.path
                || parsed.scene.revision !== pending.scene.revision
                || !Number.isInteger(parsed.width)
                || Number(parsed.width) <= 0
                || !Number.isInteger(parsed.height)
                || Number(parsed.height) <= 0
                || typeof parsed.dataUrl !== 'string'
            ) {
                settleScreenshot(requestId, jsonResponse({
                    ok: false,
                    error: 'Editor browser returned an invalid screenshot response.',
                }, 502));
                return;
            }
            const match = parsed.dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/);
            const png = match ? Buffer.from(match[1], 'base64') : undefined;
            if (!png || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
                settleScreenshot(requestId, jsonResponse({
                    ok: false,
                    error: 'Editor browser did not return PNG screenshot data.',
                }, 502));
                return;
            }
            settleScreenshot(requestId, new Response(png, {
                headers: {
                    'cache-control': 'no-store',
                    'content-type': 'image/png',
                    'x-pixifact-height': String(parsed.height),
                    'x-pixifact-revision': pending.scene.revision,
                    'x-pixifact-scene': encodeURIComponent(pending.scene.path),
                    'x-pixifact-width': String(parsed.width),
                },
            }));
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

    function synchronizedContext() {
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
        return context;
    }

    function contextResponse() {
        const result = synchronizedContext();
        return result instanceof Response ? result : jsonResponse(result);
    }

    function screenshotResponse() {
        const result = synchronizedContext();
        if (result instanceof Response) return result;
        if (result.scene.previewState !== 'ready') {
            return jsonResponse({
                ok: false,
                error: 'Editor Scene preview is not ready.',
                previewState: result.scene.previewState,
            }, 409);
        }
        const browser = activeBrowser!;
        const requestId = `screenshot-${++screenshotSequence}`;
        const scene = {
            path: result.scene.path,
            revision: result.scene.revision,
        };
        return new Promise<Response>((resolve) => {
            const timeout = setTimeout(() => {
                settleScreenshot(requestId, jsonResponse({
                    ok: false,
                    error: 'Editor screenshot capture timed out.',
                }, 504));
            }, screenshotTimeoutMs);
            pendingScreenshots.set(requestId, { browser, resolve, scene, timeout });
            browser.send(JSON.stringify({
                type: 'editorScreenshotRequested',
                protocolVersion: editorSessionProtocolVersion,
                requestId,
                scene,
            }));
        });
    }

    function fetchRequest(request: Request) {
        const pathname = new URL(request.url).pathname;
        if (
            pathname !== '/api/editor-session/health'
            && pathname !== '/api/editor-context'
            && pathname !== '/api/editor-screenshot'
        ) {
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
        if (pathname === '/api/editor-screenshot') {
            if (request.method !== 'POST') {
                return jsonResponse({ ok: false, error: 'Editor screenshot requires POST.' }, 405);
            }
            return screenshotResponse();
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

export async function captureEditorScreenshot(
    options: EditorSessionLookupOptions,
): Promise<EditorScreenshotResult | { ok: false; error: string; [key: string]: unknown }> {
    const projectRoot = fs.realpathSync(options.projectRoot);
    const descriptor = readEditorSessionDescriptor(projectRoot, options.sessionsRoot);
    if (!descriptor) {
        return {
            ok: false,
            error: 'No Pixifact Editor Host is running for this project.',
        };
    }
    if (descriptor.projectRoot !== projectRoot) {
        return {
            ok: false,
            error: 'Pixifact Editor session belongs to a different project.',
        };
    }
    const fetcher = options.fetch ?? fetch;
    let response: Response;
    try {
        response = await fetcher(`${descriptor.origin}/api/editor-screenshot`, {
            method: 'POST',
            headers: { authorization: `Bearer ${descriptor.token}` },
        });
    } catch {
        return {
            ok: false,
            error: 'Pixifact Editor Host is not reachable for this project.',
        };
    }
    if (!response.ok) {
        return await response.json() as { ok: false; error: string; [key: string]: unknown };
    }
    const sceneHeader = response.headers.get('x-pixifact-scene');
    const revision = response.headers.get('x-pixifact-revision');
    const width = Number(response.headers.get('x-pixifact-width'));
    const height = Number(response.headers.get('x-pixifact-height'));
    if (
        response.headers.get('content-type') !== 'image/png'
        || !sceneHeader
        || !revision
        || !Number.isInteger(width)
        || width <= 0
        || !Number.isInteger(height)
        || height <= 0
    ) {
        return { ok: false, error: 'Pixifact Editor Host returned invalid screenshot metadata.' };
    }
    const data = new Uint8Array(await response.arrayBuffer());
    if (!Buffer.from(data.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
        return { ok: false, error: 'Pixifact Editor Host did not return PNG screenshot data.' };
    }
    return {
        ok: true,
        scene: decodeURIComponent(sceneHeader),
        revision,
        width,
        height,
        data,
    };
}
