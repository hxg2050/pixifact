export interface GameState {
    hp: number;
    score: number;
    wave: number;
    energy: number;
    gameOver: boolean;
}

export function createGameState(): GameState {
    return {
        hp: 100,
        score: 0,
        wave: 1,
        energy: 100,
        gameOver: false,
    };
}
