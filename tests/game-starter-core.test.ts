import { describe, expect, it, vi } from 'vitest';
import { Sprite, Texture, TextureSource } from 'pixi.js';
import { Group } from 'pixifact/runtime';
import { createEvent } from 'pixifact/scene';
import { GameSession } from '../packages/create-pixifact/templates/game/src/core/GameSession';
import { ScreenManager } from '../packages/create-pixifact/templates/game/src/core/ScreenManager';
import { WebRecordStore } from '../packages/create-pixifact/templates/game/src/core/WebRecordStore';

describe('game starter session', () => {
    it('runs from the menu to completion, preserving the record across restarts', () => {
        const session = new GameSession(1, 3);
        expect(session.snapshot()).toEqual({ phase: 'menu', score: 0, goal: 3, bestScore: 1 });
        session.collect();
        expect(session.snapshot().score).toBe(0);

        session.start();
        session.collect();
        session.collect();
        expect(session.snapshot()).toEqual({ phase: 'playing', score: 2, goal: 3, bestScore: 2 });
        session.collect();
        expect(session.snapshot()).toEqual({ phase: 'finished', score: 3, goal: 3, bestScore: 3 });
        session.collect();
        expect(session.snapshot().score).toBe(3);

        session.start();
        expect(session.snapshot()).toEqual({ phase: 'playing', score: 0, goal: 3, bestScore: 3 });
        session.collect();
        session.menu();
        expect(session.snapshot()).toEqual({ phase: 'menu', score: 0, goal: 3, bestScore: 3 });
    });

    it('pauses scoring and resumes only a paused game', () => {
        const session = new GameSession(12);
        session.pause();
        session.resume();
        expect(session.snapshot().phase).toBe('menu');
        session.start();
        session.collect();
        session.pause();
        session.collect();
        expect(session.snapshot()).toEqual({ phase: 'paused', score: 1, goal: 8, bestScore: 12 });
        session.resume();
        session.collect();
        expect(session.snapshot()).toEqual({ phase: 'playing', score: 2, goal: 8, bestScore: 12 });
        for (let index = 0; index < 6; index += 1) session.collect();
        session.pause();
        session.resume();
        expect(session.snapshot().phase).toBe('finished');
    });

    it('returns a snapshot without exposing mutable internal state', () => {
        const session = new GameSession(5);
        const snapshot = session.snapshot();
        snapshot.phase = 'finished';
        snapshot.score = 99;
        snapshot.bestScore = 100;
        expect(session.snapshot()).toEqual({ phase: 'menu', score: 0, goal: 8, bestScore: 5 });
    });
});

describe('game starter screen manager', () => {
    it('fits current and replacement pages to the available viewport size', () => {
        const manager = new ScreenManager({ width: 1080, height: 1920 });
        const screen = new Group({ width: 120, height: 80 });
        manager.replace(screen);
        expect(screen.getSize()).toEqual({ width: 1080, height: 1920 });
        manager.setSize(1080, 1440);
        expect(screen.getSize()).toEqual({ width: 1080, height: 1440 });
        const replacement = new Group();
        manager.replace(replacement);
        expect(replacement.getSize()).toEqual({ width: 1080, height: 1440 });
        manager.destroy();
    });

    it('replaces the page, destroys descendants, and disconnects old external events', () => {
        const manager = new ScreenManager();
        const first = new Group();
        const child = first.addChild(new Group());
        const second = new Group();
        const event = createEvent();
        const listener = vi.fn();
        manager.replace(first);
        manager.track(event.connect(listener));
        event.emit();
        expect(listener).toHaveBeenCalledTimes(1);

        manager.replace(second);
        event.emit();
        expect(listener).toHaveBeenCalledTimes(1);
        expect(first.destroyed).toBe(true);
        expect(child.destroyed).toBe(true);
        expect(manager.children).toEqual([second]);
        manager.destroy();
        expect(second.destroyed).toBe(true);
    });

    it('clears connections once and retains shared image resources', () => {
        const manager = new ScreenManager();
        const screen = new Group();
        const source = new TextureSource({ width: 8, height: 8 });
        const texture = new Texture({ source });
        const sprite = screen.addChild(new Sprite(texture));
        const disconnect = vi.fn();
        manager.replace(screen);
        manager.track(disconnect);
        manager.clear();
        manager.clear();

        expect(disconnect).toHaveBeenCalledTimes(1);
        expect(manager.children).toEqual([]);
        expect(screen.destroyed).toBe(true);
        expect(sprite.destroyed).toBe(true);
        expect(texture.destroyed).toBe(false);
        expect(source.destroyed).toBe(false);
        manager.destroy();
        texture.destroy(true);
    });

    it('disconnects events on direct destruction and destruction from its parent', () => {
        const direct = new ScreenManager();
        const directDisconnect = vi.fn();
        const directScreen = new Group();
        direct.replace(directScreen);
        direct.track(directDisconnect);
        direct.destroy();
        expect(directDisconnect).toHaveBeenCalledTimes(1);
        expect(directScreen.destroyed).toBe(true);

        const parent = new Group();
        const manager = parent.addChild(new ScreenManager());
        const screen = new Group();
        const disconnect = vi.fn();
        manager.replace(screen);
        manager.track(disconnect);
        parent.destroy({ children: true });
        expect(disconnect).toHaveBeenCalledTimes(1);
        expect(manager.destroyed).toBe(true);
        expect(screen.destroyed).toBe(true);
    });
});

describe('game starter Web record store', () => {
    it('starts without a record and reads the saved score in another instance', () => {
        const values = new Map<string, string>();
        const storage = {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => { values.set(key, value); },
        };
        const store = new WebRecordStore(storage);
        expect(store.read()).toBe(0);
        store.write(7);
        expect(values.get('pixifact-game-starter.best-score')).toBe('7');
        expect(new WebRecordStore(storage).read()).toBe(7);
    });

    it('exposes malformed saved records and storage access failures', () => {
        const error = new Error('storage access failed');
        const malformed = new WebRecordStore({ getItem: () => '{broken', setItem: vi.fn() });
        expect(() => malformed.read()).toThrow(SyntaxError);
        const store = new WebRecordStore({
            getItem: () => { throw error; },
            setItem: () => { throw error; },
        });
        expect(() => store.read()).toThrow(error);
        expect(() => store.write(8)).toThrow(error);
    });
});
