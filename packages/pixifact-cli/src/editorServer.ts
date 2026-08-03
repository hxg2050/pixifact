import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
    normalizeSceneAssetId,
    pairedSceneScriptPath,
} from 'pixifact/compiler';
import { extractSceneScriptInterfaces } from 'pixifact/compiler-node';
import {
    claimEditorSession,
    createEditorHostSession,
    editorSessionProtocolVersion,
    findActiveEditorSession,
    removeEditorSessionDescriptor,
    type EditorSessionDescriptor,
} from './editorSession';

export interface EditorProjectServiceOptions {
    projectRoot: string;
    staticRoot: string;
}

export interface StartEditorOptions {
    projectRoot: string;
    staticRoot?: string;
}

export interface EditorServerSession {
    url: string;
    stop: () => void;
}

interface EditorProjectFile {
    kind: 'image' | 'scene' | 'script' | 'file';
    path: string;
}

interface BunServer {
    hostname: string;
    port: number;
    stop(closeActiveConnections?: boolean): void;
    upgrade(request: Request): boolean;
}

interface BunWebSocket {
    send(data: string): void;
}

declare const Bun: {
    serve(options: {
        fetch(request: Request, server: BunServer): Promise<Response> | Response | undefined;
        hostname: string;
        port: number;
        websocket: {
            close(socket: BunWebSocket): void;
            message(socket: BunWebSocket, message: string | ArrayBuffer | Uint8Array): void;
            open(socket: BunWebSocket): void;
        };
    }): BunServer;
};

const ignoredDirectories = new Set(['.git', '.pixifact', 'dist', 'node_modules', 'target']);
const imageExtensions = new Set(['.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']);
const scriptExtensions = new Set(['.cjs', '.js', '.jsx', '.mjs', '.ts', '.tsx']);
const contentTypes: Record<string, string> = {
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
};

class EditorRequestError extends Error {
    constructor(readonly status: number, message: string) {
        super(message);
    }
}

function jsonResponse(value: unknown, status = 200) {
    return Response.json(value, { status });
}

function sceneVersion(source: string) {
    return `sha256:${createHash('sha256').update(source).digest('hex')}`;
}

function fileKind(filePath: string): EditorProjectFile['kind'] {
    const extension = path.extname(filePath).toLowerCase();
    if (extension === '.scene') {
        return 'scene';
    }
    if (imageExtensions.has(extension)) {
        return 'image';
    }
    if (scriptExtensions.has(extension)) {
        return 'script';
    }
    return 'file';
}

function listProjectFiles(projectRoot: string) {
    const files: EditorProjectFile[] = [];

    function visit(directory: string) {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            if (entry.isSymbolicLink()) {
                continue;
            }
            const absolutePath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                if (!ignoredDirectories.has(entry.name)) {
                    visit(absolutePath);
                }
                continue;
            }
            if (entry.isFile()) {
                const relativePath = path.relative(projectRoot, absolutePath).split(path.sep).join('/');
                files.push({ path: relativePath, kind: fileKind(relativePath) });
            }
        }
    }

    visit(projectRoot);
    return files.sort((left, right) => left.path.localeCompare(right.path));
}

function readProjectSceneBindings(projectRoot: string) {
    const scenePaths = listProjectFiles(projectRoot)
        .filter((file) => file.kind === 'scene')
        .map((file) => normalizeSceneAssetId(file.path));
    return extractSceneScriptInterfaces(scenePaths.map((scene) => {
        const scriptPath = pairedSceneScriptPath(scene);
        return {
            scene,
            fileName: path.resolve(projectRoot, scriptPath),
            source: fs.readFileSync(resolveInsideRoot(projectRoot, scriptPath), 'utf8'),
        };
    }));
}

function resolveInsideRoot(root: string, requestedPath: string) {
    if (!requestedPath || path.isAbsolute(requestedPath)) {
        throw new EditorRequestError(400, 'Project path must stay inside the project root.');
    }
    const absolutePath = path.resolve(root, requestedPath);
    if (absolutePath !== root && !absolutePath.startsWith(`${root}${path.sep}`)) {
        throw new EditorRequestError(400, 'Project path must stay inside the project root.');
    }
    const realPath = fs.realpathSync(absolutePath);
    if (realPath !== root && !realPath.startsWith(`${root}${path.sep}`)) {
        throw new EditorRequestError(400, 'Project path must stay inside the project root.');
    }
    return realPath;
}

function requestPath(url: URL) {
    return url.searchParams.get('path') ?? '';
}

async function readJsonBody(request: Request) {
    const value = await request.json();
    if (!value || typeof value !== 'object') {
        throw new EditorRequestError(400, 'Request body must be a JSON object.');
    }
    return value as Record<string, unknown>;
}

function serveStaticFile(staticRoot: string, pathname: string) {
    const relativePath = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
    const requestedPath = path.resolve(staticRoot, relativePath);
    if (requestedPath !== staticRoot && !requestedPath.startsWith(`${staticRoot}${path.sep}`)) {
        throw new EditorRequestError(400, 'Static path must stay inside the Editor root.');
    }
    const filePath = fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()
        ? requestedPath
        : path.join(staticRoot, 'index.html');
    const extension = path.extname(filePath).toLowerCase();
    return new Response(fs.readFileSync(filePath), {
        headers: {
            'content-type': contentTypes[extension] ?? 'application/octet-stream',
        },
    });
}

export function createEditorProjectService(options: EditorProjectServiceOptions) {
    const projectRoot = fs.realpathSync(options.projectRoot);
    const staticRoot = fs.realpathSync(options.staticRoot);

    async function fetch(request: Request): Promise<Response> {
        try {
            const url = new URL(request.url);
            if (url.pathname === '/api/project' && request.method === 'GET') {
                const files = listProjectFiles(projectRoot);
                return jsonResponse({
                    name: path.basename(projectRoot),
                    root: projectRoot,
                    files,
                    scenes: files.filter((file) => file.kind === 'scene').map((file) => file.path),
                    images: files.filter((file) => file.kind === 'image').map((file) => file.path),
                });
            }
            if (url.pathname === '/api/scene' && request.method === 'GET') {
                const scenePath = requestPath(url);
                if (path.extname(scenePath).toLowerCase() !== '.scene') {
                    throw new EditorRequestError(400, 'Scene path must end with .scene.');
                }
                const source = fs.readFileSync(resolveInsideRoot(projectRoot, scenePath), 'utf8');
                return jsonResponse({ path: scenePath, source, version: sceneVersion(source) });
            }
            if (url.pathname === '/api/scene-bindings' && request.method === 'GET') {
                return jsonResponse(readProjectSceneBindings(projectRoot));
            }
            if (url.pathname === '/api/scene' && request.method === 'PUT') {
                const scenePath = requestPath(url);
                if (path.extname(scenePath).toLowerCase() !== '.scene') {
                    throw new EditorRequestError(400, 'Scene path must end with .scene.');
                }
                const filePath = resolveInsideRoot(projectRoot, scenePath);
                const body = await readJsonBody(request);
                if (typeof body.source !== 'string' || typeof body.expectedVersion !== 'string') {
                    throw new EditorRequestError(400, 'Scene write requires source and expectedVersion.');
                }
                const currentSource = fs.readFileSync(filePath, 'utf8');
                if (sceneVersion(currentSource) !== body.expectedVersion) {
                    throw new EditorRequestError(409, 'Scene file version changed.');
                }
                fs.writeFileSync(filePath, body.source, 'utf8');
                return jsonResponse({ path: scenePath, version: sceneVersion(body.source) });
            }
            if (url.pathname === '/api/file' && request.method === 'GET') {
                const filePath = resolveInsideRoot(projectRoot, requestPath(url));
                const extension = path.extname(filePath).toLowerCase();
                return new Response(fs.readFileSync(filePath), {
                    headers: {
                        'content-type': contentTypes[extension] ?? 'application/octet-stream',
                    },
                });
            }
            if (url.pathname.startsWith('/api/')) {
                return jsonResponse({ ok: false, error: 'Editor API route was not found.' }, 404);
            }
            return serveStaticFile(staticRoot, url.pathname);
        } catch (error) {
            if (error instanceof EditorRequestError) {
                return jsonResponse({ ok: false, error: error.message }, error.status);
            }
            throw error;
        }
    }

    return { fetch };
}

function defaultEditorStaticRoot() {
    return path.resolve(import.meta.dir, '..', 'editor');
}

function openBrowser(url: string) {
    const command = process.platform === 'darwin'
        ? ['open', url]
        : process.platform === 'win32'
            ? ['cmd', '/c', 'start', '', url]
            : ['xdg-open', url];
    spawn(command[0], command.slice(1), { detached: true, stdio: 'ignore' }).unref();
}

export async function startEditorServer(options: StartEditorOptions): Promise<EditorServerSession> {
    const staticRoot = options.staticRoot ?? defaultEditorStaticRoot();
    if (!fs.existsSync(path.join(staticRoot, 'index.html'))) {
        throw new Error('Editor frontend is not built. Run "bun run editor:frontend:build" first.');
    }
    const projectRoot = fs.realpathSync(options.projectRoot);
    const activeSession = await findActiveEditorSession({ projectRoot });
    if (activeSession) {
        openBrowser(activeSession.origin);
        return {
            url: activeSession.origin,
            stop() {},
        };
    }

    const service = createEditorProjectService({ projectRoot, staticRoot });
    const token = randomBytes(32).toString('hex');
    const hostSession = createEditorHostSession({ projectRoot, token });
    const server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch(request, bunServer) {
            const sessionResponse = hostSession.fetch(request);
            if (sessionResponse) {
                return sessionResponse;
            }
            const requestUrl = new URL(request.url);
            if (requestUrl.pathname === '/api/events') {
                if (request.headers.get('origin') !== requestUrl.origin) {
                    return Response.json({ ok: false, error: 'Editor WebSocket origin is invalid.' }, { status: 403 });
                }
                if (bunServer.upgrade(request)) {
                    return undefined;
                }
            }
            return service.fetch(request);
        },
        websocket: {
            open(socket) {
                hostSession.open(socket);
            },
            close(socket) {
                hostSession.close(socket);
            },
            message(socket, message) {
                hostSession.message(socket, message);
            },
        },
    });
    const changedPathTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const watcher = fs.watch(projectRoot, { recursive: true }, (_event, fileName) => {
        if (!fileName) {
            return;
        }
        const changedPath = String(fileName).split(path.sep).join('/');
        const pending = changedPathTimers.get(changedPath);
        if (pending) clearTimeout(pending);
        changedPathTimers.set(changedPath, setTimeout(() => {
            changedPathTimers.delete(changedPath);
            hostSession.notifyProjectFileChanged(changedPath);
        }, 30));
    });
    const url = `http://${server.hostname}:${server.port}`;
    const descriptor: EditorSessionDescriptor = {
        protocolVersion: editorSessionProtocolVersion,
        projectRoot,
        pid: process.pid,
        origin: url,
        token,
    };
    const claim = await claimEditorSession({ projectRoot, descriptor });
    if (!claim.owned) {
        watcher.close();
        for (const timer of changedPathTimers.values()) clearTimeout(timer);
        server.stop(true);
        openBrowser(claim.descriptor.origin);
        return {
            url: claim.descriptor.origin,
            stop() {},
        };
    }

    let stopped = false;
    const removeDescriptor = () => removeEditorSessionDescriptor(descriptor);
    process.once('exit', removeDescriptor);
    openBrowser(url);
    return {
        url,
        stop() {
            if (stopped) return;
            stopped = true;
            process.off('exit', removeDescriptor);
            removeDescriptor();
            for (const timer of changedPathTimers.values()) clearTimeout(timer);
            watcher.close();
            server.stop(true);
        },
    };
}
