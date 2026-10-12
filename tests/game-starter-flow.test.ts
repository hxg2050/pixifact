import { describe, expect, it, vi } from 'vitest';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import ts from 'typescript';
import * as pixi from 'pixi.js';
import 'pixi.js/events';
import * as runtime from 'pixifact/runtime';
import * as sceneRuntime from 'pixifact/scene';
import { compileScenes } from 'pixifact/compiler-node';
import { GameApp } from '../packages/create-pixifact/templates/game/src/GameApp';
import { WebRecordStore } from '../packages/create-pixifact/templates/game/src/core/WebRecordStore';
import { MainMenu } from '../packages/create-pixifact/templates/game/src/screens/MainMenu';
import { PlayScreen } from '../packages/create-pixifact/templates/game/src/screens/PlayScreen';
import { ResultScreen } from '../packages/create-pixifact/templates/game/src/screens/ResultScreen';
import { Button } from '../packages/create-pixifact/templates/game/src/ui/Button';
import { Panel } from '../packages/create-pixifact/templates/game/src/ui/Panel';
import { Dialog } from '../packages/create-pixifact/templates/game/src/ui/Dialog';
import { ProgressBar } from '../packages/create-pixifact/templates/game/src/ui/ProgressBar';

const templateRoot = resolve('packages/create-pixifact/templates/game');
const classes = { MainMenu, PlayScreen, ResultScreen, Button, Panel, Dialog, ProgressBar };
const sceneFiles = [
    'src/ui/Button', 'src/ui/Panel', 'src/ui/Dialog', 'src/ui/ProgressBar',
    'src/screens/MainMenu', 'src/screens/PlayScreen', 'src/screens/ResultScreen',
];

function registerGeneratedModule(source: string) {
    const code = ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const requireModule = (id: string) => {
        if (id === 'pixi.js') return pixi;
        if (id === 'pixifact/runtime') return runtime;
        if (id === 'pixifact/scene') return sceneRuntime;
        const name = id.split('/').at(-1)! as keyof typeof classes;
        return { [name]: classes[name] };
    };
    const module = { exports: {} };
    new Function('require', 'module', 'exports', code)(requireModule, module, module.exports);
}

function page(game: GameApp) {
    return game.children[0].children[0] as runtime.Group;
}

function button(root: runtime.Group, name: string) {
    const nodes = [...root.children];
    while (nodes.length > 0) {
        const node = nodes.pop()!;
        const source = Reflect.get(node, Symbol.for('pixifact.scene.instanceSource')) as { locator: string } | undefined;
        if (node instanceof Button && source?.locator.endsWith(`:${name}`)) return node;
        nodes.push(...node.children);
    }
    return expect.fail(`Button "${name}" was not found in the compiled Scene.`);
}

function tap(boundary: pixi.EventBoundary, target: Button) {
    updateTransforms(boundary);
    const point = target.toGlobal({ x: target.width / 2, y: target.height / 2 });
    expect(boundary.hitTest(point.x, point.y) === target).toBe(true);
    target.emit('pointerdown');
    target.emit('pointerup');
    target.emit('pointertap');
}

function updateTransforms(boundary: pixi.EventBoundary) {
    // 直接测试 Scene，没有 renderer 帧；使用 Pixi 的渲染变换更新初始化命中缓存。
    boundary.rootTarget.updateLocalTransform();
    pixi.updateRenderGroupTransforms(boundary.rootTarget.renderGroup, true);
}

describe('game starter complete flow', () => {
    it('runs the component showcase and complete game with the basic UI', async () => {
        const root = await mkdtemp(join(tmpdir(), 'pixifact-game-flow-'));
        const texture = new pixi.Texture({ source: new pixi.TextureSource({ width: 96, height: 96 }) });
        const load = vi.spyOn(pixi.Assets, 'load').mockResolvedValue(texture);
        const games: GameApp[] = [];
        try {
            await cp(templateRoot, root, {
                recursive: true,
                filter: (source) => !['node_modules', '.pixifact', 'dist', '.git'].includes(basename(source)),
            });
            await compileScenes({ projectRoot: root });
            for (const file of sceneFiles) {
                registerGeneratedModule(await readFile(join(root, '.pixifact/generated', `${file}.scene.generated.ts`), 'utf8'));
            }
            await Promise.all([MainMenu, PlayScreen, ResultScreen, Dialog].map((scene) => sceneRuntime.prepareSceneClass(scene)));

            const values = new Map<string, string>();
            const storage = {
                getItem: (key: string) => values.get(key) ?? null,
                setItem: (key: string, value: string) => { values.set(key, value); },
            };
            const game = new GameApp(new WebRecordStore(storage));
            games.push(game);
            game.enableRenderGroup();
            const stage = new pixi.Container({ isRenderGroup: true });
            stage.addChild(game);
            const resize = (width: number, height: number) => {
                const layout = runtime.calculatePixifactViewportLayout({
                    resolution: { width: 1080, height: 1920 }, mode: 'fixedWidth', screen: { width, height },
                });
                runtime.applyPixifactViewportLayout({ root: game, stage }, layout);
                expect(page(game).getSize()).toEqual(layout.scene);
                for (const layer of game.children) expect((layer as runtime.Group).getSize()).toEqual(layout.scene);
                return layout;
            };
            resize(609, 844);
            const boundary = new pixi.EventBoundary(stage);
            const menu = page(game) as MainMenu;
            expect(game.snapshot()).toMatchObject({ phase: 'menu', score: 0, goal: 8, bestScore: 0, modalOpen: false });
            expect(game.snapshot().showcase).toEqual({
                buttonClicks: 0, previewDisabled: true, progress: 50, dialogResult: null,
            });
            expect(button(menu, 'sampleButton').size).toBe('large');
            expect(button(menu, 'mediumButton').size).toBe('medium');
            expect(button(menu, 'smallButton').size).toBe('small');
            const sample = button(menu, 'sampleButton');
            const disabled = button(menu, 'disabledButton');
            tap(boundary, sample);
            tap(boundary, disabled);
            expect(game.snapshot().showcase?.buttonClicks).toBe(1);
            tap(boundary, button(menu, 'toggleButton'));
            tap(boundary, disabled);
            expect(game.snapshot().showcase).toMatchObject({ buttonClicks: 2, previewDisabled: false });
            tap(boundary, button(menu, 'toggleButton'));
            tap(boundary, disabled);
            expect(game.snapshot().showcase).toMatchObject({ buttonClicks: 2, previewDisabled: true });
            tap(boundary, button(menu, 'mediumButton'));
            tap(boundary, button(menu, 'smallButton'));
            expect(game.snapshot().showcase?.buttonClicks).toBe(4);

            const decrease = button(menu, 'decreaseButton');
            const increase = button(menu, 'increaseButton');
            for (let index = 0; index < 3; index += 1) tap(boundary, decrease);
            expect(game.snapshot().showcase?.progress).toBe(0);
            expect(decrease.disabled).toBe(true);
            for (let index = 0; index < 5; index += 1) tap(boundary, increase);
            expect(game.snapshot().showcase?.progress).toBe(100);
            expect(increase.disabled).toBe(true);

            resize(960, 640);
            const scroll = sceneRuntime.getSceneNode(menu, '0:page/slot:content/0:menuScroll') as runtime.ScrollContainer;
            scroll.emit('wheel', { deltaX: 0, deltaY: 10_000, preventDefault: vi.fn(), stopPropagation: vi.fn() });
            expect(scroll.scrollY).toBeGreaterThan(0);
            const openDialog = button(menu, 'dialogButton');
            tap(boundary, openDialog);
            const sampleDialog = game.children[1].children[0] as Dialog;
            expect(game.snapshot()).toMatchObject({ phase: 'menu', modalOpen: true, score: 0 });
            expect(game.children[0].interactiveChildren).toBe(false);
            const tallLayout = resize(375, 667);
            expect(sampleDialog.getSize()).toEqual(tallLayout.scene);
            expect(scroll.scrollY).toBe(0);
            updateTransforms(boundary);
            const samplePoint = sample.toGlobal({ x: sample.width / 2, y: sample.height / 2 });
            expect(boundary.hitTest(samplePoint.x, samplePoint.y) === sampleDialog).toBe(true);
            tap(boundary, button(sampleDialog, 'confirm'));
            expect(game.snapshot()).toMatchObject({ modalOpen: false, showcase: { dialogResult: 'confirmed' } });
            expect(game.children[0].interactiveChildren).toBe(true);
            expect(sampleDialog.destroyed).toBe(true);
            sampleDialog.cancelled.emit();
            expect(game.snapshot().showcase?.dialogResult).toBe('confirmed');
            tap(boundary, openDialog);
            const cancelledDialog = game.children[1].children[0] as Dialog;
            tap(boundary, button(cancelledDialog, 'cancel'));
            expect(game.snapshot()).toMatchObject({
                phase: 'menu', score: 0, modalOpen: false,
                showcase: { buttonClicks: 4, progress: 100, dialogResult: 'cancelled' },
            });
            expect(values.size).toBe(0);
            tap(boundary, button(menu, 'startButton'));
            const play = page(game) as PlayScreen;
            expect(menu.destroyed).toBe(true);
            menu.started.emit();
            menu.dialogRequested.emit();
            expect(page(game) === play).toBe(true);
            expect(game.snapshot()).toMatchObject({ modalOpen: false, showcase: null });

            const collect = button(play, 'collectButton');
            tap(boundary, collect);
            expect(game.snapshot()).toMatchObject({ phase: 'playing', score: 1, bestScore: 1 });
            tap(boundary, button(play, 'pauseButton'));
            expect(game.snapshot()).toMatchObject({ phase: 'paused', score: 1, modalOpen: true });
            expect(game.children[0].interactiveChildren).toBe(false);
            const dialog = game.children[1].children[0] as Dialog;
            updateTransforms(boundary);
            const collectPoint = collect.toGlobal({ x: collect.width / 2, y: collect.height / 2 });
            expect(boundary.hitTest(collectPoint.x, collectPoint.y) === dialog).toBe(true);
            collect.emit('pointertap');
            expect(game.snapshot()).toMatchObject({ phase: 'paused', score: 1, bestScore: 1 });
            expect(values.get('pixifact-game-starter.best-score')).toBe('1');

            tap(boundary, button(dialog, 'confirm'));
            expect(game.snapshot()).toMatchObject({ phase: 'playing', score: 1, modalOpen: false });
            expect(game.children[0].interactiveChildren).toBe(true);
            expect(dialog.destroyed).toBe(true);
            expect(play.destroyed).toBe(false);
            dialog.confirmed.emit();
            dialog.cancelled.emit();
            expect(page(game) === play).toBe(true);
            for (let index = 0; index < 7; index += 1) tap(boundary, collect);

            const result = page(game) as ResultScreen;
            expect(game.snapshot()).toMatchObject({ phase: 'finished', score: 8, goal: 8, bestScore: 8, modalOpen: false });
            expect(play.destroyed).toBe(true);
            play.collected.emit();
            play.paused.emit();
            expect(page(game) === result).toBe(true);
            expect(game.snapshot()).toMatchObject({ phase: 'finished', score: 8, modalOpen: false });
            expect(values.get('pixifact-game-starter.best-score')).toBe('8');

            tap(boundary, button(result, 'restartButton'));
            const replay = page(game) as PlayScreen;
            expect(result.destroyed).toBe(true);
            result.restarted.emit();
            result.returned.emit();
            expect(page(game) === replay).toBe(true);
            expect(game.snapshot()).toMatchObject({ phase: 'playing', score: 0, bestScore: 8 });
            tap(boundary, button(replay, 'collectButton'));
            expect(game.snapshot()).toMatchObject({ phase: 'playing', score: 1, bestScore: 8 });
            tap(boundary, button(replay, 'pauseButton'));
            const replayDialog = game.children[1].children[0] as Dialog;
            tap(boundary, button(replayDialog, 'cancel'));
            const returnedMenu = page(game) as MainMenu;
            expect(replay.destroyed).toBe(true);
            expect(replayDialog.destroyed).toBe(true);
            expect(game.snapshot()).toMatchObject({ phase: 'menu', score: 0, goal: 8, bestScore: 8, modalOpen: false });
            expect(returnedMenu.bestText).toBe('最高记录 · 8');
            replay.collected.emit();
            replay.paused.emit();
            replayDialog.confirmed.emit();
            expect(game.snapshot()).toMatchObject({ phase: 'menu', score: 0, modalOpen: false });
            expect(page(game) === returnedMenu).toBe(true);

            const refreshed = new GameApp(new WebRecordStore(storage));
            games.push(refreshed);
            expect(refreshed.snapshot()).toEqual(game.snapshot());
            expect((page(refreshed) as MainMenu).bestText).toBe('最高记录 · 8');
            stage.destroy();
        } finally {
            for (const game of games) game.destroy({ children: true });
            load.mockRestore();
            texture.destroy(true);
            await rm(root, { recursive: true, force: true });
        }
    }, 60_000);
});
