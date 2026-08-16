import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEditorProjectService, watchEditorProject } from '../packages/pixifact-cli/src/editorServer';

const tempRoots: string[] = [];

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
    for (const root of tempRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('Editor project service', () => {
    it('coalesces external Scene, paired script, and image file notifications', async () => {
        const fixture = createFixture();
        const changedPaths: string[] = [];
        const stopWatcher = watchEditorProject(fixture.projectRoot, (changedPath) => {
            changedPaths.push(changedPath);
        });
        try {
            await new Promise((resolve) => setTimeout(resolve, 100));
            fs.appendFileSync(path.join(fixture.projectRoot, 'src', 'scenes', 'Menu.scene'), '\n');
            fs.appendFileSync(path.join(fixture.projectRoot, 'src', 'scenes', 'Menu.scene'), '\n');
            fs.appendFileSync(path.join(fixture.projectRoot, 'src', 'scenes', 'Menu.ts'), '\n');
            fs.writeFileSync(path.join(fixture.projectRoot, 'assets', 'button.png'), 'changed-png');
            fs.mkdirSync(path.join(fixture.projectRoot, '.pixifact', 'editor'), { recursive: true });
            fs.writeFileSync(path.join(fixture.projectRoot, '.pixifact', 'editor', 'ui-state.json'), '{}\n');

            await vi.waitFor(() => {
                expect(new Set(changedPaths)).toEqual(new Set([
                    'src/scenes/Menu.scene',
                    'src/scenes/Menu.ts',
                    'assets/button.png',
                ]));
            });
            await new Promise((resolve) => setTimeout(resolve, 60));
            expect(changedPaths.filter((changedPath) => changedPath === 'src/scenes/Menu.scene')).toHaveLength(1);
            expect(changedPaths).not.toContain('.pixifact/editor/ui-state.json');
        } finally {
            stopWatcher();
        }
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
        const savedResponse = await service.fetch(new Request('http://localhost/api/editor-ui-state', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ assetTreeExpandedDirectories: ['assets', 'src/scenes'] }),
        }));
        const reloadedService = createEditorProjectService(fixture);
        const restored = await json(await reloadedService.fetch(new Request('http://localhost/api/editor-ui-state')));
        const project = await json(await reloadedService.fetch(new Request('http://localhost/api/project')));

        expect(initial).toEqual({});
        expect(savedResponse.status).toBe(200);
        expect(restored).toEqual({ assetTreeExpandedDirectories: ['assets', 'src/scenes'] });
        expect(fs.readFileSync(path.join(fixture.projectRoot, '.pixifact', 'editor', 'ui-state.json'), 'utf8'))
            .toBe('{\n  "assetTreeExpandedDirectories": [\n    "assets",\n    "src/scenes"\n  ]\n}\n');
        expect(project.files).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ path: '.pixifact/editor/ui-state.json' }),
        ]));
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
