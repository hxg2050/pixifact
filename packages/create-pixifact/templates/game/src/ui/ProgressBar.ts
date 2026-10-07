import { Group, type Rect } from 'pixifact/runtime';
import { part, scene } from 'pixifact/scene';

@scene()
export class ProgressBar extends Group {
    @part()
    protected declare fill: Rect;

    private fraction = 0;

    onMounted() {
        this.layout();
    }

    setProgress(value: number, max: number) {
        this.fraction = Math.max(0, Math.min(1, value / max));
        this.layout();
    }

    override layout() {
        super.layout();
        // Group 在 Scene 挂载完成前也会布局；@part 在挂载后注入。
        if (this.fill) this.fill.setSize(this.width * this.fraction, this.height);
    }
}
