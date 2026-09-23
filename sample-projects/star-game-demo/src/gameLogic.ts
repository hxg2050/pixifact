export interface StarGameLevel {
    goal: number;
    lives: number;
    targets: number[];
}

export interface StarGameSnapshot {
    phase: 'ready' | 'playing' | 'won' | 'lost';
    score: number;
    lives: number;
    target: number;
}

export class StarGame {
    private state: StarGameSnapshot;

    constructor(private readonly level: StarGameLevel) {
        this.state = this.initialState();
    }

    snapshot(): StarGameSnapshot {
        return { ...this.state };
    }

    start() {
        this.state = { ...this.initialState(), phase: 'playing' };
    }

    tap(cell: number) {
        if (this.state.phase !== 'playing') return;

        if (cell === this.state.target) {
            this.state.score += 1;
            if (this.state.score === this.level.goal) {
                this.state.phase = 'won';
            } else {
                this.state.target = this.level.targets[this.state.score];
            }
            return;
        }

        this.state.lives -= 1;
        if (this.state.lives === 0) this.state.phase = 'lost';
    }

    private initialState(): StarGameSnapshot {
        return {
            phase: 'ready',
            score: 0,
            lives: this.level.lives,
            target: this.level.targets[0],
        };
    }
}
