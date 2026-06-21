import { describe, expect, it } from 'vitest';
import {
    defaultPixifactProjectResolution,
    parsePixifactProjectConfig,
    pixifactProjectConfigFileName,
    summarizePixifactProjectConfig,
} from 'pixifact';

describe('Pixifact project run config', () => {
    it('parses a valid pixifact.project.json', () => {
        const config = parsePixifactProjectConfig({
            version: 1,
            name: 'Space HUD Game',
            resolution: {
                width: 720,
                height: 1280,
            },
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
            resolution: {
                width: 720,
                height: 1280,
            },
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
            resolution: {
                width: 720,
                height: 1280,
            },
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
        expect(config.resolution).toEqual(defaultPixifactProjectResolution);
        expect(summarizePixifactProjectConfig(config)).toEqual({
            name: 'Scene Only Project',
            resolution: defaultPixifactProjectResolution,
            scenes: {
                hud: 'scenes/Hud.scene',
            },
        });
    });

    it('rejects invalid project resolution data', () => {
        expect(() => parsePixifactProjectConfig({
            version: 1,
            name: 'Bad Game',
            resolution: {
                width: 0,
                height: 1334,
            },
            scenes: {},
        })).toThrow('resolution.width must be a positive number');

        expect(() => parsePixifactProjectConfig({
            version: 1,
            name: 'Bad Game',
            resolution: {
                width: 750,
                height: '1334',
            },
            scenes: {},
        })).toThrow('resolution.height must be a positive number');
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
});
