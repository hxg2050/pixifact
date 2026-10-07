import { describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
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
    target.emit('pointertap');
}

function updateTransforms(boundary: pixi.EventBoundary) {
    // 直接测试 Scene，没有 renderer 帧；使用 Pixi 的渲染变换更新初始化命中缓存。
    boundary.rootTarget.updateLocalTransform();
    pixi.updateRenderGroupTransforms(boundary.rootTarget.renderGroup, true);
}

describe('game starter complete flow', () => {
    it.each(['paper', 'mint'])('runs the complete game with the applied %s UI', async (kit) => {
        const root = await mkdtemp(join(tmpdir(), 'pixifact-game-flow-'));
        const texture = new pixi.Texture({ source: new pixi.TextureSource({ width: 96, height: 96 }) });
        const load = vi.spyOn(pixi.Assets, 'load').mockResolvedValue(texture);
        const games: GameApp[] = [];
        try {
            await cp(templateRoot, root, {
                recursive: true,
                filter: (source) => !['node_modules', '.pixifact', 'dist', '.git'].includes(basename(source)),
            });
            const scripts = await Promise.all(sceneFiles.map((file) => readFile(join(root, `${file}.ts`), 'utf8')));
            execFileSync('bun', ['scripts/apply-ui.mjs', kit], { cwd: root, stdio: 'pipe' });
            expect(await Promise.all(sceneFiles.map((file) => readFile(join(root, `${file}.ts`), 'utf8'))))
                .toEqual(scripts);
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
            const boundary = new pixi.EventBoundary(game);
            const menu = page(game) as MainMenu;
            expect(game.snapshot()).toEqual({ phase: 'menu', score: 0, goal: 8, bestScore: 0, modalOpen: false });
            tap(boundary, button(menu, 'startButton'));
            const play = page(game) as PlayScreen;
            expect(menu.destroyed).toBe(true);
            menu.started.emit();
            expect(page(game) === play).toBe(true);

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
            expect(game.snapshot()).toEqual({ phase: 'finished', score: 8, goal: 8, bestScore: 8, modalOpen: false });
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
            expect(game.snapshot()).toEqual({ phase: 'menu', score: 0, goal: 8, bestScore: 8, modalOpen: false });
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
        } finally {
            for (const game of games) game.destroy({ children: true });
            load.mockRestore();
            texture.destroy(true);
            await rm(root, { recursive: true, force: true });
        }
    }, 60_000);
});
