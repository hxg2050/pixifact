import { Group, setFrameLayout } from 'pixifact/runtime';
import project from '../pixifact.project.json';
import { GameSession } from './core/GameSession';
import { ScreenManager } from './core/ScreenManager';
import { WebRecordStore } from './core/WebRecordStore';
import { MainMenu } from './screens/MainMenu';
import { PlayScreen } from './screens/PlayScreen';
import { ResultScreen } from './screens/ResultScreen';
import { Dialog } from './ui/Dialog';

export class GameApp extends Group {
    private readonly session: GameSession;
    private readonly screens = new ScreenManager();
    private readonly modals = new ScreenManager();
    private modalOpen = false;

    constructor(private readonly records: WebRecordStore) {
        super(project.resolution);
        this.session = new GameSession(records.read());
        for (const layer of [this.screens, this.modals]) {
            setFrameLayout(layer, { left: 0, right: 0, top: 0, bottom: 0 });
        }
        this.addChild(this.screens, this.modals);
        this.showMenu();
    }

    snapshot() {
        const screen = this.screens.children[0];
        return {
            ...this.session.snapshot(),
            modalOpen: this.modalOpen,
            showcase: screen instanceof MainMenu ? screen.snapshot() : null,
        };
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
        dialog.cancelText = '返回组件展台';
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
        this.screens.track(screen.dialogRequested.connect(() => this.previewDialog(screen)));
    }

    private previewDialog(screen: MainMenu) {
        this.screens.interactiveChildren = false;
        this.modalOpen = true;
        const dialog = new Dialog();
        dialog.title = 'Dialog · 弹窗预览';
        dialog.message = '确认或取消后，按钮会显示结果。';
        dialog.confirmText = '确认';
        dialog.cancelText = '取消';
        this.modals.replace(dialog);
        this.modals.track(dialog.confirmed.connect(() => {
            this.closeModal();
            screen.reportDialog(true);
        }));
        this.modals.track(dialog.cancelled.connect(() => {
            this.closeModal();
            screen.reportDialog(false);
        }));
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
