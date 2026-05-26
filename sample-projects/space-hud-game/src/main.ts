import './styles.css';
import 'pixifact:scenes';
import { Application, Container, Graphics, Text } from 'pixi.js';
import { Asteroid, spawnAsteroid } from './game/enemies';
import { attachKeyboardInput, createInputState } from './game/input';
import { PlayerShip } from './game/player';
import {
    addScore,
    advanceGameClock,
    applyPlayerHit,
    createInitialGameState,
} from './game/state';
import {
    computeDesignBounds,
    computeViewportLayout,
    DESIGN_HEIGHT,
    screenToDesignPoint,
} from './game/viewport';
import type { ViewportLayout } from './game/viewport';
import { bindHudState } from './ui/hudBindings';
import { bindGameOver, bindMenuActions } from './ui/menuBindings';
import { circlesOverlap, containerCircle } from './game/collision';
import { GameOver } from './scenes/GameOver';
import { Hud } from './scenes/Hud';
import { MainMenu } from './scenes/MainMenu';

const root = document.querySelector<HTMLElement>('#game');
if (!root) {
    throw new Error('Missing #game root.');
}
const gameRoot = root;

const app = new Application();
await app.init({
    resizeTo: gameRoot,
    backgroundColor: 0x020617,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
});
gameRoot.append(app.canvas);

type Mode = 'menu' | 'playing' | 'gameOver';

let layout = computeViewportLayout(gameRoot.clientWidth || 720, gameRoot.clientHeight || 1280);
let mode: Mode = 'menu';
let state = createInitialGameState();
let elapsed = 0;
let spawnTimer = 0;

const input = createInputState();
const detachInput = attachKeyboardInput(input);
const world = new Container();
const designLayer = new Container();
const gameLayer = new Container();
const asteroidLayer = new Container();
const backgroundLayer = new Container();
const stars = new Graphics();
const player = new PlayerShip();
const hud = new Hud();
let menu = new MainMenu();
let gameOver: GameOver | undefined;
const asteroids: Asteroid[] = [];

const touchPad = new Graphics();
const touchHint = new Text({
    text: 'Drag to move',
    style: {
        fill: 0x94a3b8,
        fontSize: 22,
        fontWeight: '700',
    },
});
let touchActive = false;

app.stage.addChild(world);
world.addChild(backgroundLayer, designLayer);
backgroundLayer.addChild(stars);
designLayer.addChild(gameLayer, hud);
gameLayer.addChild(asteroidLayer, player, touchPad, touchHint);
hud.visible = false;

bindMenuActions(menu, startGame);
designLayer.addChild(menu);

function drawBackground(nextLayout: ViewportLayout) {
    stars.clear();
    stars.rect(0, 0, nextLayout.worldWidth, nextLayout.worldHeight).fill(0x020617);
    for (let i = 0; i < 90; i += 1) {
        const x = (i * 97) % nextLayout.worldWidth;
        const y = (i * 193) % nextLayout.worldHeight;
        const radius = 1 + (i % 4) * 0.6;
        const alpha = 0.3 + (i % 5) * 0.12;
        stars.circle(x, y, radius).fill({ color: 0xe0f2fe, alpha });
    }
    stars.roundRect(
        nextLayout.designOffsetX + 28,
        nextLayout.designOffsetY + 318,
        nextLayout.designWidth - 56,
        nextLayout.designHeight - 468,
        34,
    ).stroke({ width: 2, color: 0x1e40af, alpha: 0.6 });
}

function applyLayout() {
    const width = gameRoot.clientWidth || window.innerWidth || 720;
    const height = gameRoot.clientHeight || window.innerHeight || 1280;
    layout = computeViewportLayout(width, height);
    app.renderer.resize(width, height);
    world.scale.set(layout.scale);
    backgroundLayer.position.set(0, 0);
    designLayer.position.set(layout.designOffsetX, layout.designOffsetY);
    drawBackground(layout);
    touchPad.clear()
        .roundRect(0, 0, 210, 82, 24)
        .fill({ color: 0x0f172a, alpha: 0.62 })
        .stroke({ width: 2, color: 0x38bdf8, alpha: 0.45 });
    touchPad.position.set(254, DESIGN_HEIGHT - 118);
    touchPad.eventMode = 'static';
    touchPad.cursor = 'grab';
    touchHint.position.set(291, DESIGN_HEIGHT - 91);
    if (mode !== 'playing') {
        player.reset();
    }
}

function startGame() {
    mode = 'playing';
    state = createInitialGameState();
    elapsed = 0;
    spawnTimer = 0;
    clearAsteroids();
    menu.visible = false;
    if (gameOver) {
        gameOver.destroy({ children: true });
        gameOver = undefined;
    }
    hud.visible = true;
    gameLayer.visible = true;
    player.reset();
    bindHudState(hud, state);
}

function finishGame() {
    mode = 'gameOver';
    hud.visible = false;
    gameLayer.visible = false;
    gameOver = new GameOver();
    bindGameOver(gameOver, state, restartGame);
    designLayer.addChild(gameOver);
}

function restartGame() {
    if (gameOver) {
        designLayer.removeChild(gameOver);
        gameOver.destroy({ children: true });
        gameOver = undefined;
    }
    menu = new MainMenu();
    bindMenuActions(menu, startGame);
    designLayer.addChild(menu);
    mode = 'menu';
    gameLayer.visible = true;
    hud.visible = false;
}

function clearAsteroids() {
    for (const asteroid of asteroids.splice(0)) {
        asteroid.destroy({ children: true });
    }
    asteroidLayer.removeChildren();
}

function updateGame(deltaSeconds: number) {
    elapsed += deltaSeconds;
    state = advanceGameClock(state, Math.floor(elapsed));
    state = addScore(state, deltaSeconds * (10 + state.wave * 4));
    player.update(input, deltaSeconds);

    spawnTimer -= deltaSeconds;
    if (spawnTimer <= 0) {
        const asteroid = spawnAsteroid(state.wave);
        asteroids.push(asteroid);
        asteroidLayer.addChild(asteroid);
        spawnTimer = Math.max(0.32, 1.08 - state.wave * 0.07);
    }

    const playerBody = containerCircle(player, player.radius);
    for (let i = asteroids.length - 1; i >= 0; i -= 1) {
        const asteroid = asteroids[i];
        asteroid.update(deltaSeconds);
        if (circlesOverlap(playerBody, containerCircle(asteroid, asteroid.radius))) {
            state = applyPlayerHit(state, 18);
            asteroidLayer.removeChild(asteroid);
            asteroid.destroy({ children: true });
            asteroids.splice(i, 1);
            continue;
        }
        if (asteroid.y > DESIGN_HEIGHT + asteroid.radius + 60) {
            asteroidLayer.removeChild(asteroid);
            asteroid.destroy({ children: true });
            asteroids.splice(i, 1);
        }
    }

    bindHudState(hud, state);
    if (state.gameOver) {
        finishGame();
    }
}

touchPad.on('pointerdown', (event) => {
    touchActive = true;
    touchPad.cursor = 'grabbing';
    movePlayerToPointer(event.global.x, event.global.y);
});
touchPad.on('pointermove', (event) => {
    if (touchActive) {
        movePlayerToPointer(event.global.x, event.global.y);
    }
});
touchPad.on('pointerup', () => {
    touchActive = false;
    touchPad.cursor = 'grab';
});
touchPad.on('pointerupoutside', () => {
    touchActive = false;
    touchPad.cursor = 'grab';
});

function movePlayerToPointer(screenX: number, screenY: number) {
    if (mode !== 'playing') {
        return;
    }
    const point = screenToDesignPoint(layout, screenX, screenY);
    const bounds = computeDesignBounds();
    player.x = Math.max(bounds.left, Math.min(bounds.right, point.x));
    player.y = Math.max(bounds.top, Math.min(bounds.bottom, point.y));
}

window.addEventListener('resize', applyLayout);
window.addEventListener('pagehide', detachInput);
applyLayout();
player.reset();
gameLayer.visible = true;

app.ticker.add((ticker) => {
    if (mode !== 'playing') {
        return;
    }
    updateGame(Math.min(ticker.deltaMS / 1000, 0.05));
});
