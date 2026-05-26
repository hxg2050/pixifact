import type { GameState } from '../game/state';
import type { Hud } from '../scenes/Hud';

export function bindHudState(hud: Hud, state: GameState) {
    hud.hp = state.hp;
    hud.score = state.score;
    hud.wave = state.wave;
    hud.time = state.elapsedSeconds;
    hud.energy = state.energy;
}
