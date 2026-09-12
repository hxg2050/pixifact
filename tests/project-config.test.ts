import { describe, expect, it } from 'vitest';
import {
    defaultPixifactProjectResolution,
    defaultPixifactProjectViewport,
    parsePixifactProjectConfig,
    pixifactProjectConfigFileName,
    summarizePixifactProjectConfig,
} from 'pixifact';

describe('Pixifact project config', () => {
    it('parses a valid pixifact.project.json', () => {
        const config = parsePixifactProjectConfig({
            version: 2,
            name: 'Space HUD Game',
            resolution: {
                width: 720,
                height: 1280,
            },
            viewport: {
                mode: 'fixedWidth',
            },
            scenes: {
                hud: 'scenes/Hud.scene',
                gameOver: 'scenes/GameOver.scene',
            },
        });

        expect(pixifactProjectConfigFileName).toBe('pixifact.project.json');
        expect(config).toEqual({
            version: 2,
            name: 'Space HUD Game',
            resolution: {
                width: 720,
                height: 1280,
            },
            viewport: {
                mode: 'fixedWidth',
            },
            scenes: {
                hud: 'scenes/Hud.scene',
                gameOver: 'scenes/GameOver.scene',
            },
        });
        expect(summarizePixifactProjectConfig(config)).toEqual({
            name: 'Space HUD Game',
            resolution: {
                width: 720,
                height: 1280,
            },
            viewport: {
                mode: 'fixedWidth',
            },
            scenes: config.scenes,
        });
    });

    it('applies default resolution and viewport values', () => {
        const config = parsePixifactProjectConfig({
            version: 2,
            name: 'Scene Only Project',
            scenes: {
                hud: 'scenes/Hud.scene',
            },
        });

        expect(config.resolution).toEqual(defaultPixifactProjectResolution);
        expect(config.viewport).toEqual(defaultPixifactProjectViewport);
        expect(summarizePixifactProjectConfig(config)).toEqual({
            name: 'Scene Only Project',
            resolution: defaultPixifactProjectResolution,
            viewport: defaultPixifactProjectViewport,
            scenes: {
                hud: 'scenes/Hud.scene',
            },
        });
    });

    it('rejects invalid viewport mode data', () => {
        expect(() => parsePixifactProjectConfig({
            version: 2,
            name: 'Bad Game',
            viewport: {
                mode: 'stretch',
            },
            scenes: {},
        })).toThrow('viewport.mode must be one of showAll, cover, fixedWidth, fixedHeight');
    });

    it('rejects invalid project resolution data', () => {
        expect(() => parsePixifactProjectConfig({
            version: 2,
            name: 'Bad Game',
            resolution: {
                width: 0,
                height: 1334,
            },
            scenes: {},
        })).toThrow('resolution.width must be a positive number');

        expect(() => parsePixifactProjectConfig({
            version: 2,
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
            version: 2,
            name: 'Bad Game',
            scenes: {
                hud: '../Hud.scene',
            },
        })).toThrow('scenes.hud must stay inside projectRoot');
    });

    it('parses local and remote resource packs with fixed directory conventions', () => {
        const config = parsePixifactProjectConfig({
            version: 2,
            name: 'Game',
            scenes: {
                main: 'src/scenes/Main.scene',
            },
            resourcePacks: ['common', 'chapter1'],
            remoteResourcePacks: {
                common: 'https://cdn.example.com/common/',
            },
        });

        expect(config.resourcePacks).toEqual(['common', 'chapter1']);
        expect(config.remoteResourcePacks).toEqual({
            common: 'https://cdn.example.com/common',
        });
        expect(summarizePixifactProjectConfig(config)).toMatchObject({
            resourcePacks: ['common', 'chapter1'],
            remoteResourcePacks: { common: 'https://cdn.example.com/common' },
        });
    });

    it('rejects version 1 and the removed targets schema', () => {
        expect(() => parsePixifactProjectConfig({
            version: 1,
            name: 'Old Game',
            scenes: {},
        })).toThrow('pixifact.project.json version must be 2');

        expect(() => parsePixifactProjectConfig({
            version: 2,
            name: 'Old Target Game',
            scenes: {},
            targets: {
                wechat: {
                    entry: 'src/wechat/main.ts',
                },
            },
        })).toThrow('targets is not supported');
    });

    it('rejects duplicate pack names and invalid remote pack mappings', () => {
        expect(() => parsePixifactProjectConfig({
            version: 2,
            name: 'Duplicate Packs',
            scenes: {},
            resourcePacks: ['common', 'common'],
        })).toThrow('resourcePacks must not contain duplicate names');

        expect(() => parsePixifactProjectConfig({
            version: 2,
            name: 'Missing Remote Pack',
            scenes: {},
            resourcePacks: ['common'],
            remoteResourcePacks: {
                missing: 'https://cdn.example.com/missing',
            },
        })).toThrow('remoteResourcePacks.missing must reference resourcePacks');

        expect(() => parsePixifactProjectConfig({
            version: 2,
            name: 'Insecure Remote Pack',
            scenes: {},
            resourcePacks: ['common'],
            remoteResourcePacks: {
                common: 'http://cdn.example.com/common',
            },
        })).toThrow('remoteResourcePacks.common must be an HTTPS URL');

        expect(() => parsePixifactProjectConfig({
            version: 2,
            name: 'Invalid Remote Pack',
            scenes: {},
            resourcePacks: ['common'],
            remoteResourcePacks: {
                common: 'https://',
            },
        })).toThrow('remoteResourcePacks.common must be an HTTPS URL');
    });
});
