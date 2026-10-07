export interface GameSnapshot {
    phase: 'menu' | 'playing' | 'paused' | 'finished';
    score: number;
    goal: number;
    bestScore: number;
}

export class GameSession {
    private state: GameSnapshot;

    constructor(bestScore: number, goal = 8) {
        this.state = { phase: 'menu', score: 0, goal, bestScore };
    }

    start() {
        this.state.phase = 'playing';
        this.state.score = 0;
    }

    collect() {
        if (this.state.phase !== 'playing') return;
        this.state.score += 1;
        this.state.bestScore = Math.max(this.state.bestScore, this.state.score);
        if (this.state.score === this.state.goal) this.state.phase = 'finished';
    }

    pause() {
        if (this.state.phase === 'playing') this.state.phase = 'paused';
    }

    resume() {
        if (this.state.phase === 'paused') this.state.phase = 'playing';
    }

    menu() {
        this.state.phase = 'menu';
        this.state.score = 0;
    }

    snapshot(): GameSnapshot {
        return { ...this.state };
    }
}
