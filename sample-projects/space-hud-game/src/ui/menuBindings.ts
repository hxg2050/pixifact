import type { GameState } from '../game/state';
import type { GameOver } from '../scenes/GameOver';
import type { MainMenu } from '../scenes/MainMenu';

export function bindMenuActions(menu: MainMenu, startGame: () => void) {
    menu.start.connect(startGame);
}

export function bindGameOver(gameOver: GameOver, state: GameState, restart: () => void) {
    gameOver.finalScore = state.score;
    gameOver.restart.connect(restart);
}
