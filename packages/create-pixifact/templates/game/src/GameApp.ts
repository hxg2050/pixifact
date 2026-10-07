import { Group } from 'pixifact/runtime';
import { GameSession } from './core/GameSession';
import { ScreenManager } from './core/ScreenManager';
import { WebRecordStore } from './core/WebRecordStore';
import { MainMenu } from './screens/MainMenu';
import { PlayScreen } from './screens/PlayScreen';
import { ResultScreen } from './screens/ResultScreen';
import { Dialog } from './ui/Dialog';

export class GameApp extends Group {
    private readonly session: GameSession;
    private readonly screens = new ScreenManager({ width: 750, height: 1334 });
    private readonly modals = new ScreenManager({ width: 750, height: 1334 });
    private modalOpen = false;

    constructor(private readonly records: WebRecordStore) {
        super({ width: 750, height: 1334 });
        this.session = new GameSession(records.read());
        this.addChild(this.screens, this.modals);
        this.showMenu();
    }

    snapshot() {
        return { ...this.session.snapshot(), modalOpen: this.modalOpen };
    }

    pause() {
        if (this.session.snapshot().phase !== 'playing') return;
        this.session.pause();
        this.screens.interactiveChildren = false;
        this.modalOpen = true;
        const dialog = new Dialog();
        dialog.title = '休息一下';
        dialog.message = '星光会等你回来。';
        dialog.confirmText = '继续游戏';
        dialog.cancelText = '返回菜单';
        this.modals.replace(dialog);
        this.modals.track(dialog.confirmed.connect(() => {
            this.session.resume();
            this.closeModal();
        }));
        this.modals.track(dialog.cancelled.connect(() => this.showMenu()));
    }

    private start() {
        this.closeModal();
        this.session.start();
        const screen = new PlayScreen();
        this.screens.replace(screen);
        screen.renderProgress(0, this.session.snapshot().goal);
        this.screens.track(screen.paused.connect(() => this.pause()));
        this.screens.track(screen.collected.connect(() => {
            const previousBest = this.session.snapshot().bestScore;
            this.session.collect();
            const state = this.session.snapshot();
            if (state.bestScore > previousBest) this.records.write(state.bestScore);
            if (state.phase === 'finished') {
                this.showResult();
            } else {
                screen.renderProgress(state.score, state.goal);
            }
        }));
    }

    private showMenu() {
        this.closeModal();
        this.session.menu();
        const screen = new MainMenu();
        screen.bestText = `最高记录 · ${this.session.snapshot().bestScore}`;
        this.screens.replace(screen);
        this.screens.track(screen.started.connect(() => this.start()));
    }

    private showResult() {
        const state = this.session.snapshot();
        const screen = new ResultScreen();
        screen.scoreText = `本局 · ${state.score} 份星光`;
        screen.bestText = `最高记录 · ${state.bestScore}`;
        this.screens.replace(screen);
        this.screens.track(screen.restarted.connect(() => this.start()));
        this.screens.track(screen.returned.connect(() => this.showMenu()));
    }

    private closeModal() {
        this.modals.clear();
        this.modalOpen = false;
        this.screens.interactiveChildren = true;
    }
}
