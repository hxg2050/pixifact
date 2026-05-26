import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePixifactProjectConfig } from 'pixifact';
import { parseSceneTemplate } from 'pixifact/compiler';
import {
    DESIGN_HEIGHT,
    DESIGN_WIDTH,
    computeDesignBounds,
    computeViewportLayout,
    screenToDesignPoint,
} from '../sample-projects/space-hud-game/src/game/viewport';
import { spawnAsteroid } from '../sample-projects/space-hud-game/src/game/enemies';
import {
    addScore,
    advanceGameClock,
    applyPlayerHit,
    createInitialGameState,
} from '../sample-projects/space-hud-game/src/game/state';

const sampleRoot = path.resolve('sample-projects/space-hud-game');

function readSampleFile(relativePath: string) {
    return fs.readFileSync(path.join(sampleRoot, relativePath), 'utf8');
}

describe('space HUD game sample project', () => {
    it('defines a vertical Pixifact run project with bound scenes', () => {
        const config = parsePixifactProjectConfig(JSON.parse(readSampleFile('pixifact.project.json')));

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
                url: 'http://localhost:5176',
            },
        });

        for (const scenePath of Object.values(config.scenes)) {
            const template = parseSceneTemplate(readSampleFile(scenePath));
            expect(template.props).toMatchObject({
                width: DESIGN_WIDTH,
                height: DESIGN_HEIGHT,
            });
            expect(template.script?.path).toBe(`src/scenes/${path.basename(scenePath, '.scene')}.ts`);
        }
    });

    it('keeps the vertical design visible across common screen ratios', () => {
        const layouts = [
            computeViewportLayout(390, 844),
            computeViewportLayout(430, 932),
            computeViewportLayout(768, 1024),
            computeViewportLayout(1024, 768),
        ];

        for (const layout of layouts) {
            expect(layout.designWidth).toBe(DESIGN_WIDTH);
            expect(layout.designHeight).toBe(DESIGN_HEIGHT);
            expect(layout.worldWidth).toBeGreaterThanOrEqual(DESIGN_WIDTH);
            expect(layout.worldHeight).toBeGreaterThanOrEqual(DESIGN_HEIGHT);
            expect(layout.designOffsetX).toBeGreaterThanOrEqual(0);
            expect(layout.designOffsetY).toBeGreaterThanOrEqual(0);
            expect(layout.scale).toBeGreaterThan(0);
        }
    });

    it('maps pointer and gameplay bounds into design-local coordinates', () => {
        const layout = computeViewportLayout(1024, 768);
        const bounds = computeDesignBounds();
        const center = screenToDesignPoint(
            layout,
            (layout.designOffsetX + DESIGN_WIDTH / 2) * layout.scale,
            (layout.designOffsetY + DESIGN_HEIGHT / 2) * layout.scale,
        );

        expect(bounds).toEqual({
            left: 46,
            right: 674,
            top: 320,
            bottom: 1096,
        });
        expect(center).toEqual({
            x: DESIGN_WIDTH / 2,
            y: DESIGN_HEIGHT / 2,
        });
    });

    it('updates player-facing HUD state for damage, scoring, and waves', () => {
        let state = createInitialGameState();

        state = applyPlayerHit(state, 35);
        state = addScore(state, 240);
        state = advanceGameClock(state, 41);

        expect(state.hp).toBe(65);
        expect(state.score).toBe(240);
        expect(state.wave).toBe(3);
        expect(state.elapsedSeconds).toBe(41);
        expect(state.gameOver).toBe(false);

        state = applyPlayerHit(state, 80);

        expect(state.hp).toBe(0);
        expect(state.gameOver).toBe(true);
    });

    it('spawns asteroids just above the gameplay lane instead of behind the HUD', () => {
        const bounds = computeDesignBounds();
        const asteroid = spawnAsteroid(2, () => 0.5);

        expect(asteroid.x).toBeGreaterThan(bounds.left);
        expect(asteroid.x).toBeLessThan(bounds.right);
        expect(asteroid.y).toBe(bounds.top - asteroid.radius - 20);
    });
});
