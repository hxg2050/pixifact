import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    createRuntimeHostSession,
    findActiveRuntimeSession,
    readRuntimeSessionDescriptor,
    removeRuntimeSessionDescriptor,
    runtimeSessionDescriptorPath,
    runtimeSessionProtocolVersion,
    writeRuntimeSessionDescriptor,
    type RuntimeHostBrowserSocket,
    type RuntimeSessionDescriptor,
} from '../packages/pixifact/src/compiler-node/runtimeVite';
import {
    queryRuntime,
    queryRuntimeList,
} from '../packages/pixifact-cli/src/runtimeSession';

const tempRoots: string[] = [];

function createTempProject() {
    const projectRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pixifact-runtime-project-')));
    const sessionsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pixifact-runtime-sessions-'));
    tempRoots.push(projectRoot, sessionsRoot);
    return { projectRoot, sessionsRoot };
}

function createSocket() {
    return {
        send: vi.fn(),
    } satisfies RuntimeHostBrowserSocket;
}

function authorizedRequest(url: string, token: string, init: RequestInit = {}) {
    return new Request(url, {
        ...init,
        headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
            ...init.headers,
        },
    });
}

afterEach(() => {
    vi.useRealTimers();
    for (const root of tempRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('Pixifact Runtime host session', () => {
    it('lists announced pages, updates readiness, and removes disconnected pages', async () => {
        const socket = createSocket();
        const session = createRuntimeHostSession({
            projectRoot: '/project',
            token: 'secret',
            now: () => new Date('2026-08-05T11:00:00.000Z'),
        });
        session.open(socket);
        session.message(socket, 'pixifact:runtime:announce', {
            runtimeId: 'runtime-a',
            url: 'http://127.0.0.1:5178/game',
            title: 'Adventure',
            ready: false,
        });
        session.message(socket, 'pixifact:runtime:announce', {
            runtimeId: 'runtime-a',
            url: 'http://127.0.0.1:5178/game',
            title: 'Adventure',
            ready: true,
        });

        const listed = await session.fetch(authorizedRequest(
            'http://127.0.0.1:5178/__pixifact_runtime__/list',
            'secret',
        ));

        expect(listed?.status).toBe(200);
        expect(await listed?.json()).toEqual({
            ok: true,
            runtimes: [{
                runtimeId: 'runtime-a',
                url: 'http://127.0.0.1:5178/game',
                title: 'Adventure',
                ready: true,
                connectedAt: '2026-08-05T11:00:00.000Z',
            }],
        });

        session.close(socket);
        const empty = await session.fetch(authorizedRequest(
            'http://127.0.0.1:5178/__pixifact_runtime__/list',
            'secret',
        ));
        expect(await empty?.json()).toEqual({ ok: true, runtimes: [] });
    });

    it('requires the private token for health, list, and runtime requests', async () => {
        const session = createRuntimeHostSession({ projectRoot: '/project', token: 'secret' });

        for (const pathname of [
            '/__pixifact_runtime__/health',
            '/__pixifact_runtime__/list',
            '/__pixifact_runtime__/request',
        ]) {
            const response = await session.fetch(new Request(`http://127.0.0.1:5178${pathname}`));
            expect(response?.status).toBe(401);
            expect(await response?.json()).toEqual({
                ok: false,
                error: 'Pixifact Runtime session token is invalid.',
            });
        }
    });

    it('routes a request to its runtime socket and resolves the matching HMR response', async () => {
        const socket = createSocket();
        const session = createRuntimeHostSession({ projectRoot: '/project', token: 'secret' });
        session.open(socket);
        session.message(socket, 'pixifact:runtime:announce', {
            runtimeId: 'runtime-a',
            url: 'http://127.0.0.1:5178/',
            title: 'Game',
            ready: true,
        });

        const responsePromise = session.fetch(authorizedRequest(
            'http://127.0.0.1:5178/__pixifact_runtime__/request',
            'secret',
            {
                method: 'POST',
                body: JSON.stringify({
                    runtimeId: 'runtime-a',
                    request: { type: 'tree' },
                }),
            },
        ));
        await vi.waitFor(() => expect(socket.send).toHaveBeenCalledTimes(1));
        const [, request] = socket.send.mock.calls[0] as [string, {
            requestId: string;
            runtimeId: string;
        }];
        expect(socket.send.mock.calls[0][0]).toBe('pixifact:runtime:request');
        expect(request.runtimeId).toBe('runtime-a');

        session.message(socket, 'pixifact:runtime:response', {
            requestId: request.requestId,
            runtimeId: 'runtime-a',
            ok: true,
            result: { runtimeId: 'runtime-a', root: { uid: 1 } },
        });
        const response = await responsePromise;

        expect(response?.status).toBe(200);
        expect(await response?.json()).toEqual({
            runtimeId: 'runtime-a',
            root: { uid: 1 },
        });
    });

    it('rejects unknown runtimes and settles pending requests when a page disconnects', async () => {
        const socket = createSocket();
        const session = createRuntimeHostSession({ projectRoot: '/project', token: 'secret' });
        session.open(socket);

        const unknown = await session.fetch(authorizedRequest(
            'http://127.0.0.1:5178/__pixifact_runtime__/request',
            'secret',
            {
                method: 'POST',
                body: JSON.stringify({ runtimeId: 'missing', request: { type: 'tree' } }),
            },
        ));
        expect(unknown?.status).toBe(404);

        session.message(socket, 'pixifact:runtime:announce', {
            runtimeId: 'runtime-a',
            url: 'http://127.0.0.1:5178/',
            title: 'Game',
            ready: true,
        });
        const pending = session.fetch(authorizedRequest(
            'http://127.0.0.1:5178/__pixifact_runtime__/request',
            'secret',
            {
                method: 'POST',
                body: JSON.stringify({ runtimeId: 'runtime-a', request: { type: 'state' } }),
            },
        ));
        await vi.waitFor(() => expect(socket.send).toHaveBeenCalledTimes(1));
        session.close(socket);

        const disconnected = await pending;
        expect(disconnected?.status).toBe(409);
        expect(await disconnected?.json()).toEqual({
            ok: false,
            error: 'Pixifact Runtime page disconnected during the request.',
        });
    });

    it('times out a runtime request that does not receive an HMR response', async () => {
        vi.useFakeTimers();
        const socket = createSocket();
        const session = createRuntimeHostSession({
            projectRoot: '/project',
            requestTimeoutMs: 1_000,
            token: 'secret',
        });
        session.open(socket);
        session.message(socket, 'pixifact:runtime:announce', {
            runtimeId: 'runtime-a',
            url: 'http://127.0.0.1:5178/',
            title: 'Game',
            ready: true,
        });

        const pending = session.fetch(authorizedRequest(
            'http://127.0.0.1:5178/__pixifact_runtime__/request',
            'secret',
            {
                method: 'POST',
                body: JSON.stringify({ runtimeId: 'runtime-a', request: { type: 'logs' } }),
            },
        ));
        await vi.advanceTimersByTimeAsync(1_000);
        const response = await pending;

        expect(response?.status).toBe(504);
        expect(await response?.json()).toEqual({
            ok: false,
            error: 'Pixifact Runtime request timed out.',
        });
    });
});

describe('Pixifact Runtime session descriptor', () => {
    it('writes, reads, and removes only the matching project descriptor', () => {
        const { projectRoot, sessionsRoot } = createTempProject();
        const descriptor: RuntimeSessionDescriptor = {
            protocolVersion: runtimeSessionProtocolVersion,
            projectRoot,
            pid: 123,
            origin: 'http://127.0.0.1:5178',
            token: 'secret',
        };

        writeRuntimeSessionDescriptor(descriptor, sessionsRoot);

        expect(readRuntimeSessionDescriptor(projectRoot, sessionsRoot)).toEqual(descriptor);
        if (process.platform !== 'win32') {
            expect(fs.statSync(runtimeSessionDescriptorPath(projectRoot, sessionsRoot)).mode & 0o777).toBe(0o600);
        }

        removeRuntimeSessionDescriptor({ ...descriptor, token: 'other' }, sessionsRoot);
        expect(readRuntimeSessionDescriptor(projectRoot, sessionsRoot)).toEqual(descriptor);

        removeRuntimeSessionDescriptor(descriptor, sessionsRoot);
        expect(readRuntimeSessionDescriptor(projectRoot, sessionsRoot)).toBeUndefined();
    });

    it('finds only a reachable host for the canonical current project', async () => {
        const { projectRoot, sessionsRoot } = createTempProject();
        const descriptor: RuntimeSessionDescriptor = {
            protocolVersion: runtimeSessionProtocolVersion,
            projectRoot,
            pid: 123,
            origin: 'http://127.0.0.1:5178',
            token: 'secret',
        };
        writeRuntimeSessionDescriptor(descriptor, sessionsRoot);
        const fetcher = vi.fn(async () => Response.json({
            protocolVersion: runtimeSessionProtocolVersion,
            projectRoot,
        }));

        await expect(findActiveRuntimeSession({ projectRoot, sessionsRoot, fetch: fetcher }))
            .resolves.toEqual(descriptor);
        expect(fetcher).toHaveBeenCalledWith(
            'http://127.0.0.1:5178/__pixifact_runtime__/health',
            { headers: { authorization: 'Bearer secret' } },
        );

        await expect(findActiveRuntimeSession({
            projectRoot,
            sessionsRoot,
            fetch: vi.fn(async () => { throw new Error('offline'); }),
        })).resolves.toBeUndefined();
    });

    it('requires an explicit runtime id when multiple game pages are connected', async () => {
        const { projectRoot, sessionsRoot } = createTempProject();
        const descriptor: RuntimeSessionDescriptor = {
            protocolVersion: runtimeSessionProtocolVersion,
            projectRoot,
            pid: 123,
            origin: 'http://127.0.0.1:5178',
            token: 'secret',
        };
        writeRuntimeSessionDescriptor(descriptor, sessionsRoot);
        const runtimes = [
            {
                runtimeId: 'runtime-a',
                url: 'http://127.0.0.1:5178/a',
                title: 'A',
                ready: true,
                connectedAt: '2026-08-05T11:00:00.000Z',
            },
            {
                runtimeId: 'runtime-b',
                url: 'http://127.0.0.1:5178/b',
                title: 'B',
                ready: true,
                connectedAt: '2026-08-05T11:01:00.000Z',
            },
        ];
        const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
            const url = String(input);
            if (url.endsWith('/health')) {
                return Response.json({ protocolVersion: runtimeSessionProtocolVersion, projectRoot });
            }
            if (url.endsWith('/list')) return Response.json({ ok: true, runtimes });
            return Response.json({
                runtimeId: JSON.parse(String(init?.body)).runtimeId,
                root: { uid: 1 },
            });
        });

        const ambiguous = await queryRuntime({
            projectRoot,
            sessionsRoot,
            fetch: fetcher as typeof fetch,
            request: { type: 'tree' },
        });
        expect(ambiguous).toEqual({
            ok: false,
            error: 'Multiple Pixifact Runtime game pages are connected. Use --runtime <runtime-id>.',
            runtimes,
        });

        const selected = await queryRuntime({
            projectRoot,
            sessionsRoot,
            fetch: fetcher as typeof fetch,
            runtimeId: 'runtime-b',
            request: { type: 'tree' },
        });
        expect(selected).toEqual({ runtimeId: 'runtime-b', root: { uid: 1 } });
        expect(fetcher).toHaveBeenLastCalledWith(
            'http://127.0.0.1:5178/__pixifact_runtime__/request',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ runtimeId: 'runtime-b', request: { type: 'tree' } }),
            }),
        );
    });

    it('reports the missing Vite Runtime host without a fixed-port fallback', async () => {
        const { projectRoot, sessionsRoot } = createTempProject();

        await expect(queryRuntimeList({ projectRoot, sessionsRoot })).resolves.toEqual({
            ok: false,
            error: 'No Pixifact Runtime Vite server is running for this project.',
        });
    });
});
