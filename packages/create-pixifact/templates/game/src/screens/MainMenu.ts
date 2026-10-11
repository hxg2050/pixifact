import { Group } from 'pixifact/runtime';
import { createEvent, event, part, prop, scene } from 'pixifact/scene';
import { Button } from '../ui/Button';
import { ProgressBar } from '../ui/ProgressBar';

@scene()
export class MainMenu extends Group {
    @prop({ default: '最高记录 · 0' })
    declare bestText: string;

    @prop({ default: '已点击 · 0 次' })
    declare clickText: string;

    @prop({ default: true })
    declare previewDisabled: boolean;

    @prop({ default: '已禁用' })
    declare previewText: string;

    @prop({ default: '启用按钮' })
    declare toggleText: string;

    @prop({ default: '当前进度 · 50%' })
    declare progressText: string;

    @prop({ default: '打开弹窗' })
    declare dialogText: string;

    @part()
    protected declare progressBar: ProgressBar;

    @part()
    protected declare decreaseButton: Button;

    @part()
    protected declare increaseButton: Button;

    @event()
    readonly started = createEvent();

    @event()
    readonly dialogRequested = createEvent();

    private buttonClicks = 0;
    private progress = 50;
    private dialogResult: 'confirmed' | 'cancelled' | null = null;

    onMounted() {
        this.renderProgress();
    }

    snapshot() {
        return {
            buttonClicks: this.buttonClicks,
            previewDisabled: this.previewDisabled,
            progress: this.progress,
            dialogResult: this.dialogResult,
        };
    }

    click() {
        this.buttonClicks += 1;
        this.clickText = `已点击 · ${this.buttonClicks} 次`;
    }

    togglePreview() {
        this.previewDisabled = !this.previewDisabled;
        this.previewText = this.previewDisabled ? '已禁用' : '可点击';
        this.toggleText = this.previewDisabled ? '启用按钮' : '禁用按钮';
    }

    decrease() {
        this.progress = Math.max(0, this.progress - 25);
        this.renderProgress();
    }

    increase() {
        this.progress = Math.min(100, this.progress + 25);
        this.renderProgress();
    }

    openDialog() {
        this.dialogRequested.emit();
    }

    reportDialog(confirmed: boolean) {
        this.dialogResult = confirmed ? 'confirmed' : 'cancelled';
        this.dialogText = confirmed ? '已确认 · 再试' : '已取消 · 再试';
    }

    start() {
        this.started.emit();
    }

    private renderProgress() {
        this.progressBar.setProgress(this.progress, 100);
        this.progressText = `当前进度 · ${this.progress}%`;
        this.decreaseButton.disabled = this.progress === 0;
        this.increaseButton.disabled = this.progress === 100;
    }
}
