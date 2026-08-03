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
    queryEditorContext,
    writeEditorSessionDescriptor,
    type EditorSessionDescriptor,
} from '../packages/pixifact-cli/src/editorSession';

const tempRoots: string[] = [];

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

function contextMessage(scenePath: string, revision: string, syncState = 'synced') {
    return JSON.stringify({
        type: 'editorContextChanged',
        protocolVersion: editorSessionProtocolVersion,
        context: {
            scene: { path: scenePath, revision, syncState },
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
    it('accepts one browser, rejects a second, and exposes authenticated read-only context', async () => {
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
        host.message(secondary, contextMessage(fixture.scenePath, version(fixture.source)));

        expect(primary.messages).toEqual([{
            type: 'editorSessionAccepted',
            protocolVersion: editorSessionProtocolVersion,
        }]);
        expect(secondary.messages).toEqual([{
            type: 'editorSessionOccupied',
            protocolVersion: editorSessionProtocolVersion,
        }]);

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

        host.close(primary);
        const disconnected = await host.fetch(new Request('http://localhost/api/editor-context', {
            headers: { authorization: 'Bearer session-token' },
        }));
        expect(disconnected?.status).toBe(409);
        expect(await responseJson(disconnected!)).toMatchObject({
            ok: false,
            error: 'No active Editor browser session.',
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
