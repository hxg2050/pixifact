import './styles.css';
import { Application, Group } from 'pixifact';
import { Graphics } from 'pixi.js';
import type { InstantiateResult } from 'pixifact';
import { createEnemy } from './game/enemies';
import type { Enemy } from './game/enemies';
import { createInputState } from './game/input';
import { createPlayer } from './game/player';
import { distanceSquared } from './game/collision';
import { createGameState } from './game/state';
import { updateHud } from './ui/hudBindings';
import { loadPixifactScene } from './ui/loadPixifactScene';
import { bindMenu } from './ui/menuBindings';

const root = document.querySelector<HTMLMainElement>('#game');
if (!root) {
    throw new Error('Missing #game root.');
}

const app = new Application();
await app.init({
    width: 960,
    height: 540,
    backgroundColor: 0x07111f,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
});
root.append(app.canvas);

const world = new Group();
app.root.addChild(world);
world.width = 960;
world.height = 540;

const uiLayer = new Group();
app.root.addChild(uiLayer);
uiLayer.width = 960;
uiLayer.height = 540;

function stars() {
    const field = new Graphics();
    for (let i = 0; i < 120; i += 1) {
        field.circle(Math.random() * 960, Math.random() * 540, Math.random() * 1.8 + 0.5)
            .fill(0x9cc9ff);
    }
    return field;
}

world.display.addChild(stars());

let menuScene: InstantiateResult | undefined;
let hudScene: InstantiateResult | undefined;
let gameOverScene: InstantiateResult | undefined;
const state = createGameState();
const input = createInputState();
const player = createPlayer();
let started = false;
let elapsed = 0;
let spawnTimer = 0;
const enemies: Enemy[] = [];

world.display.addChild(player.sprite);

function placePlayer() {
    player.sprite.position.set(player.x, player.y);
}

function spawnEnemy() {
    const enemy = createEnemy(80 + Math.random() * 800, state.wave);
    enemies.push(enemy);
    world.display.addChild(enemy.sprite);
}

function removeEnemy(enemy: Enemy) {
    enemies.splice(enemies.indexOf(enemy), 1);
    enemy.sprite.destroy();
}

function startGame() {
    started = true;
    if (menuScene) {
        menuScene.root.display.visible = false;
    }
    if (hudScene) {
        hudScene.root.display.visible = true;
    }
    player.x = 480;
    player.y = 420;
    state.hp = 100;
    state.score = 0;
    state.wave = 1;
    state.energy = 100;
    state.gameOver = false;
    elapsed = 0;
    spawnTimer = 0;
    for (const enemy of [...enemies]) {
        removeEnemy(enemy);
    }
}

function endGame() {
    started = false;
    state.gameOver = true;
    if (hudScene) {
        hudScene.root.display.visible = false;
    }
    if (gameOverScene) {
        gameOverScene.root.display.visible = true;
        const finalScore = gameOverScene.components.get('finalScore') as { text?: string; setDirty?: () => void } | undefined;
        if (finalScore) {
            finalScore.text = `Final Score ${state.score}`;
            finalScore.setDirty?.();
        }
    }
}

menuScene = await loadPixifactScene('/scenes/MainMenu.scene', uiLayer);
hudScene = await loadPixifactScene('/scenes/Hud.scene', uiLayer);
gameOverScene = await loadPixifactScene('/scenes/GameOver.scene', uiLayer);
hudScene.root.display.visible = false;
gameOverScene.root.display.visible = false;
bindMenu(menuScene, startGame);
updateHud(hudScene, state);
placePlayer();

app.ticker.add((ticker) => {
    const dt = ticker.deltaTime;
    if (!started) {
        return;
    }

    elapsed += dt;
    spawnTimer -= dt;
    state.wave = Math.max(1, Math.floor(elapsed / 600) + 1);
    state.energy = Math.min(100, state.energy + dt * 0.28);

    const speed = 4.2;
    if (input.left) player.x -= speed * dt;
    if (input.right) player.x += speed * dt;
    if (input.up) player.y -= speed * dt;
    if (input.down) player.y += speed * dt;
    player.x = Math.max(28, Math.min(932, player.x));
    player.y = Math.max(80, Math.min(500, player.y));
    placePlayer();

    if (input.fire && state.energy >= 18) {
        state.energy -= 18;
        state.score += 10;
        if (enemies.length > 0) {
            removeEnemy(enemies[0]);
        }
    }

    if (spawnTimer <= 0) {
        spawnTimer = Math.max(16, 58 - state.wave * 4);
        spawnEnemy();
    }

    for (const enemy of [...enemies]) {
        enemy.y += enemy.speed * dt;
        enemy.sprite.position.set(enemy.x, enemy.y);
        if (distanceSquared(enemy.x, enemy.y, player.x, player.y) < 900) {
            state.hp -= 14;
            removeEnemy(enemy);
            continue;
        }
        if (enemy.y > 570) {
            state.score += 5;
            removeEnemy(enemy);
        }
    }

    updateHud(hudScene, state);
    if (state.hp <= 0) {
        endGame();
    }
});
