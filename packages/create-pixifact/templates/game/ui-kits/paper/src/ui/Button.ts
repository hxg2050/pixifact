import type { Container } from 'pixi.js';
import { Group } from 'pixifact/runtime';
import { bindSceneNodeProp, createEvent, defineVariants, event, part, prop, scene, slot } from 'pixifact/scene';

const buttonSizes = defineVariants({
    large: { width: 420, height: 96, fontSize: 30, labelPadding: 64, iconInset: 28, iconSize: 32 },
    medium: { width: 300, height: 80, fontSize: 26, labelPadding: 56, iconInset: 24, iconSize: 28 },
    small: { width: 200, height: 64, fontSize: 22, labelPadding: 40, iconInset: 16, iconSize: 24 },
});

@scene()
export class Button extends Group {
    @prop({ default: '按钮' })
    declare text: string;

    @prop({ default: false })
    declare disabled: boolean;

    @prop({ default: 'medium', variants: buttonSizes })
    declare size: keyof typeof buttonSizes;

    @part()
    protected declare visual: Group;

    @event()
    readonly clicked = createEvent();

    @slot()
    declare readonly icon: Container;

    private releasedAt: number | null = null;

    onMounted() {
        bindSceneNodeProp(this, { kind: 'binding', path: ['size', 'width'] }, this, 'width');
        bindSceneNodeProp(this, { kind: 'binding', path: ['size', 'height'] }, this, 'height');
        this.on('pointercancel', this.release, this);
    }

    press() {
        if (this.disabled) return;
        this.releasedAt = null;
        this.setVisualScale(0.97);
        this.onRender = this.updateAnimation;
    }

    release() {
        if (this.visual.scale.x === 1) return;
        this.releasedAt = performance.now();
    }

    activate() {
        if (this.disabled) return;
        this.press();
        this.release();
        this.clicked.emit();
    }

    override layout() {
        super.layout();
        // Group 在 Scene 挂载完成前也会布局；@part 在挂载后注入。
        if (this.visual) this.setVisualScale(this.visual.scale.x);
    }

    private setVisualScale(scale: number) {
        this.visual.scale.set(scale);
        this.visual.position.set(this.width * (1 - scale) / 2, this.height * (1 - scale) / 2);
    }

    private updateAnimation = () => {
        if (this.disabled) {
            this.setVisualScale(1);
            this.releasedAt = null;
            this.onRender = null;
            return;
        }
        if (this.releasedAt === null) return;
        const progress = Math.min(1, (performance.now() - this.releasedAt) / 140);
        this.setVisualScale(1 - 0.03 * (1 - progress) ** 3);
        if (progress === 1) {
            this.releasedAt = null;
            this.onRender = null;
        }
    };
}
