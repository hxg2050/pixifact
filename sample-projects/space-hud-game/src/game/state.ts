export interface GameState {
    hp: number;
    maxHp: number;
    score: number;
    wave: number;
    elapsedSeconds: number;
    energy: number;
    gameOver: boolean;
}

export function createInitialGameState(): GameState {
    return {
        hp: 100,
        maxHp: 100,
        score: 0,
        wave: 1,
        elapsedSeconds: 0,
        energy: 100,
        gameOver: false,
    };
}

export function applyPlayerHit(state: GameState, damage: number): GameState {
    const hp = Math.max(0, state.hp - damage);
    return {
        ...state,
        hp,
        gameOver: hp === 0,
    };
}

export function addScore(state: GameState, score: number): GameState {
    return {
        ...state,
        score: state.score + score,
    };
}

export function advanceGameClock(state: GameState, elapsedSeconds: number): GameState {
    return {
        ...state,
        elapsedSeconds,
        wave: Math.floor(elapsedSeconds / 20) + 1,
        energy: Math.max(0, Math.min(100, 100 - (elapsedSeconds % 20) * 3)),
    };
}
