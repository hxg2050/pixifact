import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cwd } from 'node:process';
import { describe, expect, it } from 'vitest';
import { StarGame, type StarGameLevel } from '../sample-projects/star-game-demo/src/gameLogic';

const level: StarGameLevel = { goal: 3, lives: 2, targets: [4, 1, 8] };

describe('playable sample game', () => {
    it('loads a complete deterministic level from the existing resource pack', async () => {
        const source = await readFile(join(cwd(), 'sample-projects/star-game-demo/resources/demo-level/level.json'), 'utf8');
        const savedLevel = JSON.parse(source) as StarGameLevel;
        expect(savedLevel.targets.length).toBeGreaterThanOrEqual(savedLevel.goal);
        expect(savedLevel.lives).toBeGreaterThan(0);
        expect(savedLevel.targets.every((target) => Number.isInteger(target) && target >= 0 && target < 9)).toBe(true);
    });

    it('starts, scores only target taps, and wins at the goal', () => {
        const game = new StarGame(level);
        expect(game.snapshot()).toEqual({ phase: 'ready', score: 0, lives: 2, target: 4 });
        game.tap(4);
        expect(game.snapshot().score).toBe(0);

        game.start();
        game.tap(4);
        expect(game.snapshot()).toEqual({ phase: 'playing', score: 1, lives: 2, target: 1 });
        game.tap(1);
        game.tap(8);
        expect(game.snapshot()).toEqual({ phase: 'won', score: 3, lives: 2, target: 8 });
        game.tap(0);
        expect(game.snapshot().phase).toBe('won');
        game.start();
        expect(game.snapshot()).toEqual({ phase: 'playing', score: 0, lives: 2, target: 4 });
    });

    it('loses after the last wrong tap and can restart from either result', () => {
        const game = new StarGame(level);
        game.start();
        game.tap(0);
        expect(game.snapshot()).toEqual({ phase: 'playing', score: 0, lives: 1, target: 4 });
        game.tap(0);
        expect(game.snapshot()).toEqual({ phase: 'lost', score: 0, lives: 0, target: 4 });
        game.tap(4);
        expect(game.snapshot().score).toBe(0);
        game.start();
        expect(game.snapshot()).toEqual({ phase: 'playing', score: 0, lives: 2, target: 4 });
    });
});
