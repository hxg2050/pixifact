import { Group } from 'pixifact/runtime';
import { createEvent, event, part, prop, scene } from 'pixifact/scene';
import { ProgressBar } from '../ui/ProgressBar';

@scene()
export class PlayScreen extends Group {
    @prop({ default: '星光 · 0 / 8' })
    declare scoreText: string;

    @part()
    protected declare progress: ProgressBar;

    @event()
    readonly collected = createEvent();

    @event()
    readonly paused = createEvent();

    collect() {
        this.collected.emit();
    }

    pause() {
        this.paused.emit();
    }

    renderProgress(score: number, goal: number) {
        this.scoreText = `星光 · ${score} / ${goal}`;
        this.progress.setProgress(score, goal);
    }
}
