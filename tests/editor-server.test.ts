// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import childProcess, { type ChildProcess } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEditorProjectService, watchEditorProject } from '../packages/pixifact-cli/src/editorServer';

const tempRoots: string[] = [];
const hostPlatform = process.platform;

function createFixture() {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pixifact-editor-project-'));
    const staticRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pixifact-editor-static-'));
    tempRoots.push(projectRoot, staticRoot);
    fs.mkdirSync(path.join(projectRoot, 'src', 'scenes'), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'Menu.scene'), [
        '<Scene name="Menu">',
        '  <Text id="title" x="20" text="开始" />',
        '</Scene>',
        '',
    ].join('\n'));
    fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'Menu.ts'), [
        "import { Group } from 'pixifact/runtime';",
        "import { prop, scene } from 'pixifact/scene';",
        '',
        '@scene()',
        'export class Menu extends Group {',
        "  @prop({ default: '开始' })",
        '  declare title: string;',
        '}',
        '',
    ].join('\n'));
    fs.writeFileSync(path.join(projectRoot, 'assets', 'button.png'), 'png');
    fs.writeFileSync(path.join(staticRoot, 'index.html'), '<main>Pixifact Editor</main>');
    return { projectRoot, staticRoot };
}

async function json(response: Response) {
    return response.json() as Promise<Record<string, unknown>>;
}

afterEach(() => {
    Object.defineProperty(process, 'platform', { value: hostPlatform });
    vi.restoreAllMocks();
    for (const root of tempRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('Editor project service', () => {
    it.each(['darwin', 'linux', 'win32'])('opens a project file with the %s default application without changing its bytes', async (platform) => {
        const fixture = createFixture();
        const assetPath = "assets/图标 & 100% '按钮'.png";
        const absolutePath = path.join(fixture.projectRoot, assetPath);
        fs.writeFileSync(absolutePath, 'original-image');
        const realPath = fs.realpathSync(absolutePath);
        const execute = vi.spyOn(childProcess, 'execFile').mockImplementation((...args: unknown[]) => {
            const callback = args.at(-1) as (error: Error | null, stdout: string, stderr: string) => void;
            callback(null, '', '');
            return {} as ChildProcess;
        });
        Object.defineProperty(process, 'platform', { value: platform });
        const service = createEditorProjectService(fixture);

        const response = await service.fetch(new Request(`http://localhost/api/open-file?path=${encodeURIComponent(assetPath)}`, {
            method: 'POST', headers: { origin: 'http://localhost' },
        }));

        expect(response.status).toBe(200);
        expect(await json(response)).toEqual({ ok: true });
        expect(execute).toHaveBeenCalledTimes(1);
        const [command, args, options] = execute.mock.calls[0];
        expect(options).toEqual({ windowsHide: true });
        if (platform === 'win32') {
            expect(command).toBe('powershell.exe');
            const script = (args as string[]).at(-1)!;
            const encodedPath = /FromBase64String\('([^']+)'\)/.exec(script)![1];
            expect(Buffer.from(encodedPath, 'base64').toString('utf8')).toBe(realPath);
            expect(script).toContain('Start-Process -FilePath');
            expect(script).toContain('-ErrorAction Stop');
        } else {
            expect(command).toBe(platform === 'darwin' ? 'open' : 'xdg-open');
            expect(args).toEqual([realPath]);
        }
        expect(fs.readFileSync(absolutePath, 'utf8')).toBe('original-image');
    });

    it('rejects system-open requests from another origin or without an origin', async () => {
        const fixture = createFixture();
        const execute = vi.spyOn(childProcess, 'execFile');
        const service = createEditorProjectService(fixture);
        for (const origin of [undefined, 'https://example.com']) {
            const response = await service.fetch(new Request('http://localhost/api/open-file?path=assets%2Fbutton.png', {
                method: 'POST', headers: origin ? { origin } : {},
            }));
            expect(response.status).toBe(403);
        }
        expect((await service.fetch(new Request('http://localhost/api/open-file?path=assets%2Fbutton.png'))).status).toBe(404);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects opening directories and files outside the project, including symbolic links', async () => {
        const fixture = createFixture();
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'pixifact-editor-outside-'));
        tempRoots.push(outside);
        fs.writeFileSync(path.join(outside, 'outside.png'), 'outside');
        fs.symlinkSync(outside, path.join(fixture.projectRoot, 'assets', 'outside'), 'junction');
        const execute = vi.spyOn(childProcess, 'execFile');
        const service = createEditorProjectService(fixture);
        for (const assetPath of ['../outside.png', path.join(outside, 'outside.png'), 'assets/outside/outside.png', 'assets']) {
            const response = await service.fetch(new Request(`http://localhost/api/open-file?path=${encodeURIComponent(assetPath)}`, {
                method: 'POST', headers: { origin: 'http://localhost' },
            }));
            expect(response.status).toBe(400);
        }
        expect(execute).not.toHaveBeenCalled();
    });

    it('reports a deleted asset and a failed system opener separately', async () => {
        const fixture = createFixture();
        const execute = vi.spyOn(childProcess, 'execFile').mockImplementation((...args: unknown[]) => {
            const callback = args.at(-1) as (error: Error) => void;
            callback(Object.assign(new Error('系统打开程序不可用'), { code: 'ENOENT' }));
            return {} as ChildProcess;
        });
        const service = createEditorProjectService(fixture);
        const request = () => new Request('http://localhost/api/open-file?path=assets%2Fbutton.png', {
            method: 'POST', headers: { origin: 'http://localhost' },
        });

        const failed = await service.fetch(request());
        expect(failed.status).toBe(500);
        expect(await json(failed)).toMatchObject({ error: expect.stringContaining('系统打开程序不可用') });
        fs.unlinkSync(path.join(fixture.projectRoot, 'assets', 'button.png'));
        const deleted = await service.fetch(request());
        expect(deleted.status).toBe(404);
        expect(await json(deleted)).toMatchObject({ error: expect.stringContaining('资源文件不存在') });
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('invalidates cached indexes when an entire Scene directory is added or removed', async () => {
        const fixture = createFixture();
        const service = createEditorProjectService(fixture);
        await service.fetch(new Request('http://localhost/api/project'));
        const importedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pixifact-editor-import-'));
        tempRoots.push(importedRoot);
        fs.writeFileSync(path.join(importedRoot, 'Imported.scene'), '<Scene name="Imported" />');
        fs.writeFileSync(path.join(importedRoot, 'Imported.ts'), '@scene() export class Imported {}');
        const changes: string[] = [];
        const stop = watchEditorProject(fixture.projectRoot, (changedPath) => {
            service.invalidate(changedPath);
            changes.push(changedPath);
        });
        try {
            await new Promise((resolve) => setTimeout(resolve, 50));
            const destination = path.join(fixture.projectRoot, 'src/scenes/imported');
            fs.renameSync(importedRoot, destination);
            await vi.waitFor(() => expect(changes).toContain('src/scenes/imported'));
            expect(await json(await service.fetch(new Request('http://localhost/api/project')))).toMatchObject({
                scenes: ['src/scenes/imported/Imported.scene', 'src/scenes/Menu.scene'],
            });
            fs.rmSync(destination, { recursive: true });
            await vi.waitFor(async () => expect(await json(await service.fetch(new Request('http://localhost/api/project'))))
                .toMatchObject({ scenes: ['src/scenes/Menu.scene'] }));
        } finally {
            stop();
        }
    });

    it('reuses the project index and contracts until a file notification invalidates them', async () => {
        const fixture = createFixture();
        const service = createEditorProjectService(fixture);
        const scan = vi.spyOn(fs, 'readdirSync');
        const read = vi.spyOn(fs, 'readFileSync');
        const bindingsUrl = 'http://localhost/api/scene-bindings';
        const initial = await json(await service.fetch(new Request(bindingsUrl)));
        const scans = scan.mock.calls.length;
        const reads = read.mock.calls.length;
        expect(await json(await service.fetch(new Request(bindingsUrl)))).toEqual(initial);
        expect(scan).toHaveBeenCalledTimes(scans);
        expect(read).toHaveBeenCalledTimes(reads);
        fs.appendFileSync(path.join(fixture.projectRoot, 'src/scenes/Menu.scene'), '\n');
        service.invalidate('src/scenes/Menu.scene');
        expect(await json(await service.fetch(new Request(bindingsUrl)))).toEqual(initial);
        expect(read).toHaveBeenCalledTimes(reads);

        const scriptPath = path.join(fixture.projectRoot, 'src/scenes/Menu.ts');
        fs.writeFileSync(scriptPath, fs.readFileSync(scriptPath, 'utf8').replace("default: '开始'", "default: '最新'"));
        service.invalidate('src/scenes/Menu.ts');
        const updated = await json(await service.fetch(new Request(bindingsUrl)));
        expect(updated).toMatchObject({ 'src/scenes/Menu.scene': { interface: { props: { title: { default: '最新' } } } } });
        expect(scan).toHaveBeenCalledTimes(scans);

        fs.writeFileSync(path.join(fixture.projectRoot, 'src/scenes/Other.scene'), '<Scene name="Other" />');
        fs.writeFileSync(path.join(fixture.projectRoot, 'src/scenes/Other.ts'), '@scene() export class Other {}');
        service.invalidate('src/scenes/Other.scene');
        expect(await json(await service.fetch(new Request(bindingsUrl)))).toHaveProperty('src/scenes/Other.scene');
        fs.unlinkSync(path.join(fixture.projectRoot, 'src/scenes/Other.scene'));
        service.invalidate('src/scenes/Other.scene');
        expect(await json(await service.fetch(new Request(bindingsUrl)))).not.toHaveProperty('src/scenes/Other.scene');
    });

    it('refreshes cached contracts on an explicit project read and serves versioned image bytes without HTTP caching', async () => {
        const fixture = createFixture();
        const service = createEditorProjectService(fixture);
        const url = 'http://localhost/api/scene-bindings';
        await service.fetch(new Request(url));
        const script = path.join(fixture.projectRoot, 'src/scenes/Menu.ts');
        fs.writeFileSync(script, fs.readFileSync(script, 'utf8').replace("default: '开始'", "default: '刷新'"));
        await service.fetch(new Request('http://localhost/api/project?refresh=1'));
        expect(await json(await service.fetch(new Request(url)))).toMatchObject({
            'src/scenes/Menu.scene': { interface: { props: { title: { default: '刷新' } } } },
        });
        const imageUrl = 'http://localhost/api/file?path=assets%2Fbutton.png&v=1';
        const previous = await service.fetch(new Request(imageUrl));
        expect(previous.headers.get('cache-control')).toBe('no-store');
        expect(await previous.text()).toBe('png');
        fs.writeFileSync(path.join(fixture.projectRoot, 'assets/button.png'), 'new-png');
        const latest = await service.fetch(new Request(imageUrl.replace('v=1', 'v=2')));
        expect(await latest.text()).toBe('new-png');
    });

    it('coalesces external Scene, paired script, and image file notifications', async () => {
        const fixture = createFixture();
        const changedPaths: string[] = [];
        let notify: fs.WatchListener<string>;
        const close = vi.fn();
        vi.spyOn(fs, 'watch').mockImplementation((...args: unknown[]) => {
            notify = args.at(-1) as fs.WatchListener<string>;
            return { close } as unknown as fs.FSWatcher;
        });
        vi.useFakeTimers();
        const stopWatcher = watchEditorProject(fixture.projectRoot, (changedPath) => {
            changedPaths.push(changedPath);
        });
        try {
            notify!('change', 'src/scenes/Menu.scene');
            notify!('change', 'src/scenes/Menu.scene');
            notify!('change', 'src/scenes/Menu.ts');
            notify!('change', 'assets/button.png');
            notify!('rename', '.pixifact/editor/ui-state.json');
            await vi.runAllTimersAsync();
            expect(new Set(changedPaths)).toEqual(new Set([
                'src/scenes/Menu.scene',
                'src/scenes/Menu.ts',
                'assets/button.png',
            ]));
            expect(changedPaths.filter((changedPath) => changedPath === 'src/scenes/Menu.scene')).toHaveLength(1);
            expect(changedPaths).not.toContain('.pixifact/editor/ui-state.json');
        } finally {
            stopWatcher();
            vi.useRealTimers();
        }
        expect(close).toHaveBeenCalledOnce();
    });

    it('indexes project scenes and images and serves the browser app', async () => {
        const fixture = createFixture();
        const service = createEditorProjectService(fixture);

        const project = await json(await service.fetch(new Request('http://localhost/api/project')));
        const index = await service.fetch(new Request('http://localhost/'));

        expect(project).toMatchObject({
            name: path.basename(fixture.projectRoot),
            scenes: ['src/scenes/Menu.scene'],
            images: ['assets/button.png'],
        });
        expect(project.files).toEqual(expect.arrayContaining([
            expect.objectContaining({ path: 'src/scenes/Menu.scene', kind: 'scene' }),
            expect.objectContaining({ path: 'src/scenes/Menu.ts', kind: 'script' }),
        ]));
        expect(index.status).toBe(200);
        expect(await index.text()).toContain('Pixifact Editor');
    });

    it('persists asset tree expansion separately from the project asset index', async () => {
        const fixture = createFixture();
        const service = createEditorProjectService(fixture);

        const initial = await json(await service.fetch(new Request('http://localhost/api/editor-ui-state')));
        const statePath = path.join(fixture.projectRoot, '.pixifact', 'editor', 'ui-state.json');
        fs.mkdirSync(path.dirname(statePath), { recursive: true });
        fs.writeFileSync(statePath, '{"autoSave":true}\n');
        const existingState = await json(await service.fetch(new Request('http://localhost/api/editor-ui-state')));
        const savedResponse = await service.fetch(new Request('http://localhost/api/editor-ui-state', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                assetTreeExpandedDirectories: ['assets', 'src/scenes'],
                autoSave: true,
                theme: 'dark',
                openScenePaths: ['src/scenes/Menu.scene'],
                activeScenePath: 'src/scenes/Menu.scene',
            }),
        }));
        const reloadedService = createEditorProjectService(fixture);
        const restored = await json(await reloadedService.fetch(new Request('http://localhost/api/editor-ui-state')));
        const project = await json(await reloadedService.fetch(new Request('http://localhost/api/project')));

        expect(initial).toEqual({ autoSave: false, theme: 'dark' });
        expect(existingState).toEqual({ autoSave: true, theme: 'dark' });
        expect(savedResponse.status).toBe(200);
        expect(restored).toEqual({
            assetTreeExpandedDirectories: ['assets', 'src/scenes'],
            autoSave: true,
            theme: 'dark',
            openScenePaths: ['src/scenes/Menu.scene'],
            activeScenePath: 'src/scenes/Menu.scene',
        });
        expect(JSON.parse(fs.readFileSync(statePath, 'utf8')))
            .toEqual(restored);
        expect(project.files).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ path: '.pixifact/editor/ui-state.json' }),
        ]));

        const invalidTheme = await service.fetch(new Request('http://localhost/api/editor-ui-state', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ assetTreeExpandedDirectories: [], autoSave: false, theme: 'purple' }),
        }));
        expect(invalidTheme.status).toBe(400);
    });

    it('writes a scene only when the expected version still matches', async () => {
        const fixture = createFixture();
        const service = createEditorProjectService(fixture);
        const sceneUrl = 'http://localhost/api/scene?path=src%2Fscenes%2FMenu.scene';
        const opened = await json(await service.fetch(new Request(sceneUrl)));
        const nextSource = '<Scene name="Menu">\n  <Text id="title" x="48" text="开始" />\n</Scene>\n';

        const savedResponse = await service.fetch(new Request(sceneUrl, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                source: nextSource,
                expectedVersion: opened.version,
            }),
        }));
        const saved = await json(savedResponse);
        const conflictResponse = await service.fetch(new Request(sceneUrl, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                source: '<Scene name="Menu"></Scene>\n',
                expectedVersion: opened.version,
            }),
        }));

        expect(savedResponse.status).toBe(200);
        expect(saved.version).not.toBe(opened.version);
        expect(conflictResponse.status).toBe(409);
        expect(await json(conflictResponse)).toMatchObject({
            ok: false,
            error: 'Scene file version changed.',
        });
        expect(fs.readFileSync(path.join(fixture.projectRoot, 'src', 'scenes', 'Menu.scene'), 'utf8')).toBe(nextSource);
    });

    it('extracts paired Scene interfaces on the Host without executing project scripts', async () => {
        const fixture = createFixture();
        const service = createEditorProjectService(fixture);

        const response = await service.fetch(new Request('http://localhost/api/scene-bindings'));
        const bindings = await json(response);

        expect(bindings).toMatchObject({
            'src/scenes/Menu.scene': {
                className: 'Menu',
                interface: {
                    props: {
                        title: { type: 'string', default: '开始' },
                    },
                },
            },
        });
    });

    it('rejects file access outside the bound project root', async () => {
        const fixture = createFixture();
        const service = createEditorProjectService(fixture);

        const response = await service.fetch(new Request('http://localhost/api/file?path=..%2Foutside.scene'));

        expect(response.status).toBe(400);
        expect(await json(response)).toMatchObject({
            ok: false,
            error: 'Project path must stay inside the project root.',
        });
    });
});
