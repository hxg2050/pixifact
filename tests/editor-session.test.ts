import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    claimEditorSession,
    createEditorHostSession,
    editorSessionDescriptorPath,
    editorSessionProtocolVersion,
    findActiveEditorSession,
    captureEditorScreenshot,
    queryEditorContext,
    writeEditorSessionDescriptor,
    type EditorSessionDescriptor,
} from '../packages/pixifact-cli/src/editorSession';

const tempRoots: string[] = [];
const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X1JtWQAAAABJRU5ErkJggg==', 'base64');
const pngDataUrl = `data:image/png;base64,${pngBytes.toString('base64')}`;

function createFixture() {
    const projectRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pixifact-editor-context-project-')));
    const sessionsRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pixifact-editor-context-sessions-')));
    tempRoots.push(projectRoot, sessionsRoot);
    fs.mkdirSync(path.join(projectRoot, 'src', 'scenes'), { recursive: true });
    const scenePath = 'src/scenes/Menu.scene';
    const source = [
        '<Scene name="Menu">',
        '  <Text id="title" text="开始" />',
        '</Scene>',
        '',
    ].join('\n');
    fs.writeFileSync(path.join(projectRoot, scenePath), source);
    return { projectRoot, scenePath, sessionsRoot, source };
}

function version(source: string) {
    return `sha256:${createHash('sha256').update(source).digest('hex')}`;
}

function fakeSocket() {
    const messages: unknown[] = [];
    return {
        messages,
        send(data: string) {
            messages.push(JSON.parse(data));
        },
    };
}

function contextMessage(
    scenePath: string,
    revision: string,
    syncState = 'synced',
    previewState = 'ready',
) {
    return JSON.stringify({
        type: 'editorContextChanged',
        protocolVersion: editorSessionProtocolVersion,
        context: {
            scene: { path: scenePath, revision, syncState, previewState },
            selection: {
                kind: 'node',
                locator: '0:title',
                node: {
                    kind: 'pixi',
                    type: 'Text',
                    id: 'title',
                    props: { text: '开始' },
                    childCount: 0,
                },
            },
        },
    });
}

async function responseJson(response: Response) {
    return response.json() as Promise<Record<string, unknown>>;
}

afterEach(() => {
    for (const root of tempRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('Editor Host session', () => {
    it('captures the current ready authoring Scene through the active browser', async () => {
        const fixture = createFixture();
        const host = createEditorHostSession({ projectRoot: fixture.projectRoot, token: 'token' });
        const browser = fakeSocket();
        host.open(browser);
        host.message(browser, contextMessage(fixture.scenePath, version(fixture.source)));

        const responsePromise = host.fetch(new Request('http://localhost/api/editor-screenshot', {
            method: 'POST',
            headers: { authorization: 'Bearer token' },
        }));
        await Promise.resolve();
        const request = browser.messages.at(-1) as Record<string, unknown>;
        expect(request).toMatchObject({
            type: 'editorScreenshotRequested',
            protocolVersion: editorSessionProtocolVersion,
            scene: {
                path: fixture.scenePath,
                revision: version(fixture.source),
            },
        });

        host.message(browser, JSON.stringify({
            type: 'editorScreenshotCompleted',
            protocolVersion: editorSessionProtocolVersion,
            requestId: request.requestId,
            scene: {
                path: fixture.scenePath,
                revision: version(fixture.source),
            },
            width: 640,
            height: 360,
            dataUrl: pngDataUrl,
        }));

        const response = await responsePromise;
        expect(response?.status).toBe(200);
        expect(response?.headers.get('content-type')).toBe('image/png');
        expect(decodeURIComponent(response!.headers.get('x-pixifact-scene')!)).toBe(fixture.scenePath);
        expect(response?.headers.get('x-pixifact-revision')).toBe(version(fixture.source));
        expect(response?.headers.get('x-pixifact-width')).toBe('640');
        expect(response?.headers.get('x-pixifact-height')).toBe('360');
        expect(Buffer.from(await response!.arrayBuffer())).toEqual(pngBytes);
    });

    it('refuses screenshots until the active Scene and preview are ready and current', async () => {
        const fixture = createFixture();
        const host = createEditorHostSession({ projectRoot: fixture.projectRoot, token: 'token' });
        const request = () => host.fetch(new Request('http://localhost/api/editor-screenshot', {
            method: 'POST',
            headers: { authorization: 'Bearer token' },
        }));

        const inactive = await request();
        expect(inactive?.status).toBe(409);
        expect(await responseJson(inactive!)).toMatchObject({ error: 'No active Editor browser session.' });

        const browser = fakeSocket();
        host.open(browser);
        const noContext = await request();
        expect(noContext?.status).toBe(409);
        expect(await responseJson(noContext!)).toMatchObject({ error: 'Editor context is not ready.' });

        host.message(browser, contextMessage(fixture.scenePath, version(fixture.source), 'saving'));
        const saving = await request();
        expect(saving?.status).toBe(409);
        expect(await responseJson(saving!)).toMatchObject({
            error: 'Editor Scene is not synchronized.',
            syncState: 'saving',
        });

        host.message(browser, contextMessage(fixture.scenePath, version(fixture.source), 'synced', 'loading'));
        const loading = await request();
        expect(loading?.status).toBe(409);
        expect(await responseJson(loading!)).toMatchObject({
            error: 'Editor Scene preview is not ready.',
            previewState: 'loading',
        });

        host.message(browser, contextMessage(fixture.scenePath, version(fixture.source)));
        fs.writeFileSync(path.join(fixture.projectRoot, fixture.scenePath), fixture.source.replace('开始', '继续'));
        const stale = await request();
        expect(stale?.status).toBe(409);
        expect(await responseJson(stale!)).toMatchObject({ error: 'Editor context is updating.' });
    });

    it('cancels an in-flight screenshot when the active browser closes', async () => {
        const fixture = createFixture();
        const host = createEditorHostSession({ projectRoot: fixture.projectRoot, token: 'token' });
        const browser = fakeSocket();
        host.open(browser);
        host.message(browser, contextMessage(fixture.scenePath, version(fixture.source)));

        const responsePromise = host.fetch(new Request('http://localhost/api/editor-screenshot', {
            method: 'POST',
            headers: { authorization: 'Bearer token' },
        }));
        await Promise.resolve();
        host.close(browser);

        const response = await responsePromise;
        expect(response?.status).toBe(409);
        expect(await responseJson(response!)).toMatchObject({
            error: 'Active Editor browser disconnected during screenshot capture.',
        });
    });

    it('cancels an in-flight screenshot when another browser takes over', async () => {
        const fixture = createFixture();
        const host = createEditorHostSession({ projectRoot: fixture.projectRoot, token: 'token' });
        const primary = fakeSocket();
        const secondary = fakeSocket();
        host.open(primary);
        host.message(primary, contextMessage(fixture.scenePath, version(fixture.source)));

        const responsePromise = host.fetch(new Request('http://localhost/api/editor-screenshot', {
            method: 'POST',
            headers: { authorization: 'Bearer token' },
        }));
        await Promise.resolve();
        host.open(secondary);
        host.message(secondary, JSON.stringify({
            type: 'editorSessionTakeoverRequested',
            protocolVersion: editorSessionProtocolVersion,
        }));

        const response = await responsePromise;
        expect(response?.status).toBe(409);
        expect(await responseJson(response!)).toMatchObject({
            error: 'Active Editor browser changed during screenshot capture.',
        });
    });

    it('keeps one active browser and explicitly transfers control to a standby browser', async () => {
        const fixture = createFixture();
        const host = createEditorHostSession({
            projectRoot: fixture.projectRoot,
            token: 'session-token',
            now: () => new Date('2026-08-03T08:00:00.000Z'),
        });
        const primary = fakeSocket();
        const secondary = fakeSocket();

        host.open(primary);
        host.open(secondary);
        host.message(primary, contextMessage(fixture.scenePath, version(fixture.source)));

        expect(primary.messages).toEqual([{
            type: 'editorSessionActive',
            protocolVersion: editorSessionProtocolVersion,
        }]);
        expect(secondary.messages).toEqual([
            {
                type: 'editorSessionStandby',
                protocolVersion: editorSessionProtocolVersion,
            },
            {
                type: 'editorSessionStandby',
                protocolVersion: editorSessionProtocolVersion,
                resume: {
                    scenePath: fixture.scenePath,
                    selectedLocator: '0:title',
                },
            },
        ]);

        host.message(secondary, JSON.stringify({
            type: 'editorSessionTakeoverRequested',
            protocolVersion: editorSessionProtocolVersion,
        }));

        expect(primary.messages.at(-1)).toEqual({
            type: 'editorSessionStandby',
            protocolVersion: editorSessionProtocolVersion,
            reason: 'takenOver',
            resume: {
                scenePath: fixture.scenePath,
                selectedLocator: '0:title',
            },
        });
        expect(secondary.messages.at(-1)).toEqual({
            type: 'editorSessionActive',
            protocolVersion: editorSessionProtocolVersion,
            resume: {
                scenePath: fixture.scenePath,
                selectedLocator: '0:title',
            },
        });

        host.message(primary, contextMessage(fixture.scenePath, version(fixture.source)));
        const beforeNewActiveContext = await host.fetch(new Request('http://localhost/api/editor-context', {
            headers: { authorization: 'Bearer session-token' },
        }));
        expect(beforeNewActiveContext?.status).toBe(409);
        expect(await responseJson(beforeNewActiveContext!)).toMatchObject({
            ok: false,
            error: 'Editor context is not ready.',
        });

        host.message(secondary, contextMessage(fixture.scenePath, version(fixture.source)));
        host.notifyProjectFileChanged('src/scenes/Menu.scene');
        expect(primary.messages.at(-1)?.type).not.toBe('projectFileChanged');
        expect(secondary.messages.at(-1)).toEqual({
            type: 'projectFileChanged',
            path: 'src/scenes/Menu.scene',
        });

        const unauthorized = await host.fetch(new Request('http://localhost/api/editor-context'));
        const response = await host.fetch(new Request('http://localhost/api/editor-context', {
            headers: { authorization: 'Bearer session-token' },
        }));

        expect(unauthorized?.status).toBe(401);
        expect(response?.status).toBe(200);
        expect(await responseJson(response!)).toEqual({
            protocolVersion: editorSessionProtocolVersion,
            projectRoot: fixture.projectRoot,
            editor: {
                connected: true,
                updatedAt: '2026-08-03T08:00:00.000Z',
            },
            scene: {
                path: fixture.scenePath,
                revision: version(fixture.source),
                syncState: 'synced',
                previewState: 'ready',
            },
            selection: {
                kind: 'node',
                locator: '0:title',
                node: {
                    kind: 'pixi',
                    type: 'Text',
                    id: 'title',
                    props: { text: '开始' },
                    childCount: 0,
                },
            },
        });

        host.close(secondary);
        const disconnected = await host.fetch(new Request('http://localhost/api/editor-context', {
            headers: { authorization: 'Bearer session-token' },
        }));
        expect(disconnected?.status).toBe(409);
        expect(await responseJson(disconnected!)).toMatchObject({
            ok: false,
            error: 'No active Editor browser session.',
        });
    });

    it('does not transfer control while the active Scene is not synchronized', () => {
        const fixture = createFixture();
        const host = createEditorHostSession({
            projectRoot: fixture.projectRoot,
            token: 'session-token',
        });
        const primary = fakeSocket();
        const secondary = fakeSocket();
        host.open(primary);
        host.open(secondary);

        host.message(secondary, JSON.stringify({
            type: 'editorSessionTakeoverRequested',
            protocolVersion: editorSessionProtocolVersion,
        }));

        expect(secondary.messages.at(-1)).toEqual({
            type: 'editorSessionStandby',
            protocolVersion: editorSessionProtocolVersion,
            error: '当前 Editor 尚未同步，暂时无法接管。',
        });

        host.message(primary, contextMessage(fixture.scenePath, version(fixture.source), 'saving'));

        host.message(secondary, JSON.stringify({
            type: 'editorSessionTakeoverRequested',
            protocolVersion: editorSessionProtocolVersion,
        }));

        expect(secondary.messages.at(-1)).toEqual({
            type: 'editorSessionStandby',
            protocolVersion: editorSessionProtocolVersion,
            error: '当前 Editor 尚未同步，暂时无法接管。',
            resume: {
                scenePath: fixture.scenePath,
                selectedLocator: '0:title',
            },
        });
    });

    it('refuses stale, saving, and invalid Scene context', async () => {
        const fixture = createFixture();
        const host = createEditorHostSession({ projectRoot: fixture.projectRoot, token: 'token' });
        const browser = fakeSocket();
        const request = new Request('http://localhost/api/editor-context', {
            headers: { authorization: 'Bearer token' },
        });
        host.open(browser);
        host.message(browser, contextMessage(fixture.scenePath, version(fixture.source), 'saving'));

        const saving = await host.fetch(request.clone());
        expect(saving?.status).toBe(409);
        expect(await responseJson(saving!)).toMatchObject({ syncState: 'saving' });

        host.message(browser, contextMessage(fixture.scenePath, version(fixture.source)));
        const changedSource = fixture.source.replace('text="开始"', 'text="继续"');
        fs.writeFileSync(path.join(fixture.projectRoot, fixture.scenePath), changedSource);
        const stale = await host.fetch(request.clone());
        expect(stale?.status).toBe(409);
        expect(await responseJson(stale!)).toMatchObject({
            ok: false,
            error: 'Editor context is updating.',
        });

        fs.writeFileSync(path.join(fixture.projectRoot, fixture.scenePath), '<Scene');
        const invalid = await host.fetch(request.clone());
        expect(invalid?.status).toBe(422);
        expect(await responseJson(invalid!)).toMatchObject({
            ok: false,
            error: 'Scene parsing failed.',
            scene: { path: fixture.scenePath, revision: version('<Scene') },
        });
    });

    it('discovers the project Host and queries context with its private token', async () => {
        const fixture = createFixture();
        const descriptor: EditorSessionDescriptor = {
            protocolVersion: editorSessionProtocolVersion,
            projectRoot: fixture.projectRoot,
            pid: 1234,
            origin: 'http://127.0.0.1:43120',
            token: 'private-token',
        };
        writeEditorSessionDescriptor(descriptor, fixture.sessionsRoot);
        const fetcher = vi.fn(async (input: string | URL | Request) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
            if (url.endsWith('/api/editor-session/health')) {
                return Response.json({
                    protocolVersion: editorSessionProtocolVersion,
                    projectRoot: fixture.projectRoot,
                });
            }
            return Response.json({
                protocolVersion: editorSessionProtocolVersion,
                projectRoot: fixture.projectRoot,
                editor: { connected: true, updatedAt: '2026-08-03T08:00:00.000Z' },
                scene: {
                    path: fixture.scenePath,
                    revision: version(fixture.source),
                    syncState: 'synced',
                    previewState: 'ready',
                },
                selection: { kind: 'scene' },
            });
        });

        const active = await findActiveEditorSession({
            projectRoot: fixture.projectRoot,
            sessionsRoot: fixture.sessionsRoot,
            fetch: fetcher,
        });
        const context = await queryEditorContext({
            projectRoot: fixture.projectRoot,
            sessionsRoot: fixture.sessionsRoot,
            fetch: fetcher,
        });

        expect(active).toEqual(descriptor);
        expect(context).toMatchObject({
            projectRoot: fixture.projectRoot,
            selection: { kind: 'scene' },
        });
        expect(fetcher).toHaveBeenCalledWith(
            'http://127.0.0.1:43120/api/editor-context',
            { headers: { authorization: 'Bearer private-token' } },
        );
    });

    it('discovers the project Host and captures PNG bytes with its private token', async () => {
        const fixture = createFixture();
        const descriptor: EditorSessionDescriptor = {
            protocolVersion: editorSessionProtocolVersion,
            projectRoot: fixture.projectRoot,
            pid: 1234,
            origin: 'http://127.0.0.1:43120',
            token: 'private-token',
        };
        writeEditorSessionDescriptor(descriptor, fixture.sessionsRoot);
        const fetcher = vi.fn(async () => new Response(pngBytes, {
            headers: {
                'content-type': 'image/png',
                'x-pixifact-scene': fixture.scenePath,
                'x-pixifact-revision': version(fixture.source),
                'x-pixifact-width': '640',
                'x-pixifact-height': '360',
            },
        }));

        const screenshot = await captureEditorScreenshot({
            projectRoot: fixture.projectRoot,
            sessionsRoot: fixture.sessionsRoot,
            fetch: fetcher,
        });

        expect(screenshot).toMatchObject({
            ok: true,
            scene: fixture.scenePath,
            revision: version(fixture.source),
            width: 640,
            height: 360,
        });
        expect(Buffer.from(screenshot.data)).toEqual(pngBytes);
        expect(fetcher).toHaveBeenCalledWith(
            'http://127.0.0.1:43120/api/editor-screenshot',
            {
                method: 'POST',
                headers: { authorization: 'Bearer private-token' },
            },
        );
    });

    it('reuses a healthy project Host and replaces an unreachable descriptor', async () => {
        const fixture = createFixture();
        const active: EditorSessionDescriptor = {
            protocolVersion: editorSessionProtocolVersion,
            projectRoot: fixture.projectRoot,
            pid: 1234,
            origin: 'http://127.0.0.1:43120',
            token: 'active-token',
        };
        const replacement: EditorSessionDescriptor = {
            ...active,
            pid: 5678,
            origin: 'http://127.0.0.1:43121',
            token: 'replacement-token',
        };
        writeEditorSessionDescriptor(active, fixture.sessionsRoot);
        const healthyFetch = vi.fn(async () => Response.json({
            protocolVersion: editorSessionProtocolVersion,
            projectRoot: fixture.projectRoot,
        }));

        const reused = await claimEditorSession({
            projectRoot: fixture.projectRoot,
            descriptor: replacement,
            sessionsRoot: fixture.sessionsRoot,
            fetch: healthyFetch,
        });

        expect(reused).toEqual({ descriptor: active, owned: false });

        const unreachableFetch = vi.fn(async () => {
            throw new Error('connection refused');
        });
        const claimed = await claimEditorSession({
            projectRoot: fixture.projectRoot,
            descriptor: replacement,
            sessionsRoot: fixture.sessionsRoot,
            fetch: unreachableFetch,
        });

        expect(claimed).toEqual({ descriptor: replacement, owned: true });
        expect(JSON.parse(fs.readFileSync(
            path.join(fixture.sessionsRoot, `${createHash('sha256').update(fixture.projectRoot).digest('hex')}.json`),
            'utf8',
        ))).toEqual(replacement);
    });

    it('keeps a Host that is claimed while another process checks a stale descriptor', async () => {
        const fixture = createFixture();
        const stale: EditorSessionDescriptor = {
            protocolVersion: editorSessionProtocolVersion,
            projectRoot: fixture.projectRoot,
            pid: 1234,
            origin: 'http://127.0.0.1:43120',
            token: 'stale-token',
        };
        const concurrent: EditorSessionDescriptor = {
            ...stale,
            pid: 5678,
            origin: 'http://127.0.0.1:43121',
            token: 'concurrent-token',
        };
        const candidate: EditorSessionDescriptor = {
            ...stale,
            pid: 9012,
            origin: 'http://127.0.0.1:43122',
            token: 'candidate-token',
        };
        writeEditorSessionDescriptor(stale, fixture.sessionsRoot);
        let requestCount = 0;
        const fetcher = vi.fn(async () => {
            requestCount += 1;
            if (requestCount === 1) {
                fs.writeFileSync(
                    editorSessionDescriptorPath(fixture.projectRoot, fixture.sessionsRoot),
                    `${JSON.stringify(concurrent, null, 2)}\n`,
                );
                throw new Error('stale Host is unreachable');
            }
            return Response.json({
                protocolVersion: editorSessionProtocolVersion,
                projectRoot: fixture.projectRoot,
            });
        });

        const claimed = await claimEditorSession({
            projectRoot: fixture.projectRoot,
            descriptor: candidate,
            sessionsRoot: fixture.sessionsRoot,
            fetch: fetcher,
        });

        expect(claimed).toEqual({ descriptor: concurrent, owned: false });
        expect(JSON.parse(fs.readFileSync(
            editorSessionDescriptorPath(fixture.projectRoot, fixture.sessionsRoot),
            'utf8',
        ))).toEqual(concurrent);
    });
});
