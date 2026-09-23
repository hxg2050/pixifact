import { Graphics, Text } from 'pixi.js';
import { part, scene } from 'pixifact/scene';
import { Group } from 'pixifact/runtime';
import { StarGame, type StarGameLevel } from '../gameLogic';

@scene()
export class Main extends Group {
    @part() protected declare cell0: Graphics;
    @part() protected declare cell1: Graphics;
    @part() protected declare cell2: Graphics;
    @part() protected declare cell3: Graphics;
    @part() protected declare cell4: Graphics;
    @part() protected declare cell5: Graphics;
    @part() protected declare cell6: Graphics;
    @part() protected declare cell7: Graphics;
    @part() protected declare cell8: Graphics;
    @part() protected declare targetGlow: Graphics;
    @part() protected declare targetStar: Text;
    @part() protected declare scoreText: Text;
    @part() protected declare livesText: Text;
    @part() protected declare statusText: Text;
    @part() protected declare actionButton: Graphics;
    @part() protected declare actionText: Text;

    private cells!: Graphics[];
    private game!: StarGame;
    private goal = 0;

    onMounted() {
        this.cells = [
            this.cell0, this.cell1, this.cell2,
            this.cell3, this.cell4, this.cell5,
            this.cell6, this.cell7, this.cell8,
        ];
        this.cells.forEach((cell, index) => {
            cell.eventMode = 'static';
            cell.cursor = 'pointer';
            cell.on('pointertap', () => {
                this.game.tap(index);
                this.renderGame();
            });
        });
        this.actionButton.eventMode = 'static';
        this.actionButton.cursor = 'pointer';
        this.actionButton.on('pointertap', () => {
            this.game.start();
            this.renderGame();
        });
    }

    setLevel(level: StarGameLevel) {
        this.goal = level.goal;
        this.game = new StarGame(level);
        this.renderGame();
    }

    snapshot() {
        return this.game.snapshot();
    }

    private renderGame() {
        const state = this.game.snapshot();
        this.scoreText.text = `得分 ${state.score} / ${this.goal}`;
        this.livesText.text = `剩余 ${state.lives} 次`;

        const playing = state.phase === 'playing';
        this.targetGlow.visible = playing;
        this.targetStar.visible = playing;
        if (playing) {
            const cell = this.cells[state.target];
            this.targetGlow.position.copyFrom(cell.position);
            this.targetStar.position.set(cell.x + 55, cell.y + 32);
        }

        this.actionButton.visible = !playing;
        this.actionText.visible = !playing;
        this.actionText.text = state.phase === 'ready' ? '开始游戏' : '再玩一次';
        this.statusText.text = {
            ready: '点开始，然后点击发光的星格。',
            playing: '点击发光格；点错会失去一次机会。',
            won: '星轨完成！你赢了。',
            lost: '星光熄灭了，再试一次。',
        }[state.phase];
    }
}
