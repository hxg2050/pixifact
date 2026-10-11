import { describe, expect, it, vi } from 'vitest';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import * as pixi from 'pixi.js';
import * as runtime from 'pixifact/runtime';
import * as sceneRuntime from 'pixifact/scene';
import { resolveSceneReference, validateSceneContent } from 'pixifact/compiler';
import { compileScenes, extractSceneScriptInterfaces } from 'pixifact/compiler-node';
import { Button } from '../packages/create-pixifact/templates/game/src/ui/Button';
import { Panel } from '../packages/create-pixifact/templates/game/src/ui/Panel';
import { Dialog } from '../packages/create-pixifact/templates/game/src/ui/Dialog';
import { ProgressBar } from '../packages/create-pixifact/templates/game/src/ui/ProgressBar';

const templateRoot = resolve('packages/create-pixifact/templates/game');
const components = { Button, Panel, Dialog, ProgressBar };
const names = ['Button', 'Panel', 'Dialog', 'ProgressBar'] as const;

async function contracts(root: string) {
    return extractSceneScriptInterfaces(await Promise.all(names.map(async (name) => ({
        scene: `src/ui/${name}.scene`,
        fileName: `src/ui/${name}.ts`,
        source: await readFile(join(root, 'src/ui', `${name}.ts`), 'utf8'),
    }))));
}

function registerGeneratedModule(source: string) {
    const code = ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const requireModule = (id: string) => {
        if (id === 'pixi.js') return pixi;
        if (id === 'pixifact/runtime') return runtime;
        if (id === 'pixifact/scene') return sceneRuntime;
        return { [id.split('/').at(-1)!]: components[id.split('/').at(-1)! as keyof typeof components] };
    };
    const module = { exports: {} };
    new Function('require', 'module', 'exports', code)(requireModule, module, module.exports);
}

describe('game starter replaceable UI', () => {
    it('keeps the active and both kit scripts on the same public contracts', async () => {
        const active = await contracts(templateRoot);
        for (const kit of ['paper', 'mint']) {
            expect(await contracts(join(templateRoot, 'ui-kits', kit))).toEqual(active);
            for (const name of names) {
                expect(await readFile(join(templateRoot, 'ui-kits', kit, 'src/ui', `${name}.ts`), 'utf8'))
                    .toBe(await readFile(join(templateRoot, 'src/ui', `${name}.ts`), 'utf8'));
            }
        }
        for (const name of names) {
            expect(await readFile(join(templateRoot, 'src/ui', `${name}.scene`), 'utf8'))
                .toBe(await readFile(join(templateRoot, 'ui-kits/paper/src/ui', `${name}.scene`), 'utf8'));
        }
        expect(Object.keys(active['src/ui/Button.scene'].interface.props)).toEqual(['text', 'disabled', 'size']);
        expect(Object.keys(active['src/ui/Button.scene'].interface.events)).toEqual(['clicked']);
        expect(Object.keys(active['src/ui/Panel.scene'].interface.slots)).toEqual(['content']);
        expect(Object.keys(active['src/ui/Dialog.scene'].interface.events)).toEqual(['confirmed', 'cancelled']);
    });

    it.each(['paper', 'mint'])('compiles and runs %s with the active behavior scripts', async (kit) => {
        const root = await mkdtemp(join(tmpdir(), 'pixifact-game-ui-'));
        const texture = new pixi.Texture({ source: new pixi.TextureSource({ width: 96, height: 96 }) });
        const load = vi.spyOn(pixi.Assets, 'load').mockResolvedValue(texture);
        try {
            await cp(join(templateRoot, 'src/ui'), join(root, 'src/ui'), { recursive: true });
            for (const name of names) {
                await cp(join(templateRoot, 'ui-kits', kit, 'src/ui', `${name}.scene`), join(root, 'src/ui', `${name}.scene`));
            }
            await cp(join(templateRoot, 'ui-kits', kit, 'assets'), join(root, 'assets'), { recursive: true });
            const descriptors = await contracts(root);
            const interfaces = Object.fromEntries(Object.entries(descriptors).map(([path, descriptor]) => [path, descriptor.interface]));
            for (const name of names) {
                const path = `src/ui/${name}.scene`;
                expect(validateSceneContent({
                    scene: path,
                    content: await readFile(join(root, path), 'utf8'),
                    sceneInterface: interfaces[path],
                    sceneInterfaces: interfaces,
                    existingAssets: new Set(['assets/ui/button.svg', 'assets/ui/panel.svg']),
                    normalizeSceneReference: (reference) => resolveSceneReference(path, reference),
                })).toMatchObject({ ok: true });
            }
            await compileScenes({ projectRoot: root });
            for (const name of names) {
                registerGeneratedModule(await readFile(join(root, '.pixifact/generated/src/ui', `${name}.scene.generated.ts`), 'utf8'));
            }
            await sceneRuntime.prepareSceneClass(Dialog);
            await sceneRuntime.prepareSceneClass(ProgressBar);

            const button = new Button();
            let clicks = 0;
            button.clicked.connect(() => clicks++);
            button.emit('pointertap');
            button.disabled = true;
            button.emit('pointertap');
            expect((sceneRuntime.getSceneNode(button, '0:visual/3:disabledShade') as runtime.Rect).visible).toBe(true);
            button.disabled = false;
            button.emit('pointertap');
            expect(clicks).toBe(2);
            button.text = '继续';
            const label = sceneRuntime.getSceneNode(button, '0:visual/1:label') as runtime.Label;
            expect(label.text).toBe('继续');
            const icon = new runtime.Group({ width: 32, height: 32 });
            sceneRuntime.mount(button, icon, 'icon');
            expect(icon.parent).toBe(button.icon);

            expect(button.size).toBe('medium');
            for (const [size, width, height, fontSize, iconSize] of [
                ['large', 420, 96, 30, 32], ['medium', 300, 80, 26, 28], ['small', 200, 64, 22, 24],
            ] as const) {
                button.size = size;
                expect([button.width, button.height, label.fontSize]).toEqual([width, height, fontSize]);
                expect([button.icon.width, button.icon.height]).toEqual([iconSize, iconSize]);
            }
            button.setSize(260, 72);
            const visual = sceneRuntime.getSceneNode(button, '0:visual') as runtime.Group;
            const now = vi.spyOn(performance, 'now').mockReturnValue(0);
            try {
                button.emit('pointerdown');
                expect(visual.scale.x).toBeLessThan(1);
                expect(visual.scale.x).toBeGreaterThan(0.9);
                expect([button.width, button.height]).toEqual([260, 72]);
                expect((button.hitArea as pixi.Rectangle).contains(259, 1)).toBe(true);
                button.emit('pointerup');
                now.mockReturnValue(70);
                button.onRender!({} as pixi.Renderer);
                expect(visual.scale.x).toBeGreaterThan(0.97);
                expect(visual.scale.x).toBeLessThan(1);
                now.mockReturnValue(200);
                button.onRender!({} as pixi.Renderer);
                expect([visual.scale.x, visual.x, visual.y]).toEqual([1, 0, 0]);
                expect(button.onRender).toBeNull();

                for (const releaseEvent of ['pointerupoutside', 'pointerout', 'pointercancel']) {
                    button.emit('pointerdown');
                    button.emit(releaseEvent);
                    now.mockReturnValue(performance.now() + 200);
                    button.onRender!({} as pixi.Renderer);
                    expect(visual.scale.x).toBe(1);
                    expect(clicks).toBe(2);
                }

                for (let index = 0; index < 3; index += 1) {
                    button.emit('pointerdown');
                    button.emit('pointerup');
                    button.emit('pointertap');
                }
                expect(clicks).toBe(5);
                button.disabled = true;
                button.onRender!({} as pixi.Renderer);
                expect(visual.scale.x).toBe(1);
                button.emit('pointerdown');
                button.emit('pointertap');
                expect(clicks).toBe(5);
                expect(button.onRender).toBeNull();
                button.disabled = false;
            } finally {
                now.mockRestore();
            }

            await sceneRuntime.prepareSceneClass(Panel);
            const panel = new Panel();
            const child = new runtime.Group({ width: 120, height: 60 });
            sceneRuntime.mount(panel, child, 'content');
            panel.setSize(640, 480);
            expect(child.parent).toBe(panel.content);
            expect(panel.content.width).toBe(576);
            expect(panel.content.height).toBe(352);

            const progress = new ProgressBar();
            progress.setSize(420, 24);
            progress.setProgress(3, 10);
            const fill = sceneRuntime.getSceneNode(progress, '1:fill') as runtime.Rect;
            expect(fill.width).toBe(126);
            progress.setSize(600, 32);
            expect(fill.width).toBe(180);
            expect(fill.height).toBe(32);
            progress.setProgress(12, 10);
            expect(fill.width).toBe(600);
            progress.setProgress(-1, 10);
            expect(fill.width).toBe(0);

            const dialog = new Dialog();
            expect(dialog.width).toBe(750);
            expect(dialog.height).toBe(1334);
            expect(dialog.eventMode).toBe('static');
            let confirmed = 0;
            let cancelled = 0;
            dialog.confirmed.connect(() => confirmed++);
            dialog.cancelled.connect(() => cancelled++);
            (sceneRuntime.getSceneNode(dialog, '1:body/3:confirm') as Button).emit('pointertap');
            (sceneRuntime.getSceneNode(dialog, '1:body/4:cancel') as Button).emit('pointertap');
            expect([confirmed, cancelled]).toEqual([1, 1]);
            const renderRoot = new pixi.Container({ isRenderGroup: true });
            renderRoot.addChild(button);
            button.emit('pointerdown');
            expect(button.onRender).toBeTypeOf('function');
            const animate = vi.fn(button.onRender!);
            button.onRender = animate;
            renderRoot.renderGroup.runOnRender({} as pixi.Renderer);
            expect(animate).toHaveBeenCalledTimes(1);
            for (const node of [button, panel, progress, dialog]) node.destroy({ children: true });
            renderRoot.renderGroup.runOnRender({} as pixi.Renderer);
            expect(animate).toHaveBeenCalledTimes(1);
            expect(visual.destroyed).toBe(true);
            renderRoot.destroy();
        } finally {
            load.mockRestore();
            texture.destroy();
            await rm(root, { recursive: true, force: true });
        }
    });
});
