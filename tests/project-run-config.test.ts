import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    parsePixifactProjectConfig,
    pixifactProjectConfigFileName,
    summarizePixifactProjectConfig,
} from 'pixifact';

describe('Pixifact project run config', () => {
    it('parses a valid pixifact.project.json', () => {
        const config = parsePixifactProjectConfig({
            version: 1,
            name: 'Space HUD Game',
            scenes: {
                hud: 'scenes/Hud.scene',
                gameOver: 'scenes/GameOver.scene',
            },
            run: {
                command: 'bun',
                args: ['run', 'dev'],
                cwd: '.',
                url: 'http://localhost:5173',
            },
        });

        expect(pixifactProjectConfigFileName).toBe('pixifact.project.json');
        expect(config).toEqual({
            version: 1,
            name: 'Space HUD Game',
            scenes: {
                hud: 'scenes/Hud.scene',
                gameOver: 'scenes/GameOver.scene',
            },
            run: {
                command: 'bun',
                args: ['run', 'dev'],
                cwd: '.',
                url: 'http://localhost:5173',
            },
        });
        expect(summarizePixifactProjectConfig(config)).toEqual({
            name: 'Space HUD Game',
            scenes: config.scenes,
            run: config.run,
        });
    });

    it('rejects invalid run command data', () => {
        expect(() => parsePixifactProjectConfig({
            version: 1,
            name: 'Bad Game',
            scenes: {},
            run: {
                args: ['run', 'dev'],
                cwd: '.',
            },
        })).toThrow('run.command must be a non-empty string');

        expect(() => parsePixifactProjectConfig({
            version: 1,
            name: 'Bad Game',
            scenes: {},
            run: {
                command: 'bun',
                args: 'run dev',
                cwd: '.',
            },
        })).toThrow('run.args must be an array of strings');
    });

    it('allows projects without a run config', () => {
        const config = parsePixifactProjectConfig({
            version: 1,
            name: 'Scene Only Project',
            scenes: {
                hud: 'scenes/Hud.scene',
            },
        });

        expect(config.run).toBeUndefined();
        expect(summarizePixifactProjectConfig(config)).toEqual({
            name: 'Scene Only Project',
            scenes: {
                hud: 'scenes/Hud.scene',
            },
        });
    });

    it('rejects project paths outside projectRoot', () => {
        expect(() => parsePixifactProjectConfig({
            version: 1,
            name: 'Bad Game',
            scenes: {
                hud: '../Hud.scene',
            },
            run: {
                command: 'bun',
                args: ['run', 'dev'],
                cwd: '.',
            },
        })).toThrow('scenes.hud must stay inside projectRoot');

        expect(() => parsePixifactProjectConfig({
            version: 1,
            name: 'Bad Game',
            scenes: {},
            run: {
                command: 'bun',
                args: ['run', 'dev'],
                cwd: '../outside',
            },
        })).toThrow('run.cwd must stay inside projectRoot');
    });

    it('parses the Space HUD sample project config', () => {
        const config = parsePixifactProjectConfig(JSON.parse(fs.readFileSync(
            path.resolve('sample-projects/space-hud-game/pixifact.project.json'),
            'utf8',
        )));

        expect(config).toMatchObject({
            name: 'Space HUD Game',
            scenes: {
                mainMenu: 'scenes/MainMenu.scene',
                hud: 'scenes/Hud.scene',
                gameOver: 'scenes/GameOver.scene',
            },
            run: {
                command: 'bun',
                args: ['run', 'dev'],
                cwd: '.',
                url: 'http://localhost:5174',
            },
        });
    });
});
