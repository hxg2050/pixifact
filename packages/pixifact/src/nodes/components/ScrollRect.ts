import { Rectangle } from "pixi.js";
import type { FederatedPointerEvent, FederatedWheelEvent } from "pixi.js";
import { Component, ComponentMeta, Prop } from "../../runtime";
import type { Group } from "../../runtime";

@ComponentMeta({
    type: 'ui.ScrollRect',
    displayName: 'Scroll Rect',
    category: 'UI/Interaction',
    description: 'Moves a content node inside a viewport using wheel and drag input.',
    disallowMultiple: true,
})
export class ScrollRect extends Component<Group> {
    @Prop({ type: 'nodeRef', description: 'Viewport node that receives scroll input.' })
    public viewport?: Group;

    @Prop({ type: 'nodeRef', description: 'Content node moved by scroll input.' })
    public content?: Group;

    @Prop({ type: 'number', default: 0, min: 0 })
    public contentHeight = 0;

    @Prop({ type: 'number', default: 1 })
    public wheelSensitivity = 1;

    @Prop({ type: 'boolean', default: true })
    public dragEnabled = true;

    private scrollY = 0;
    private dragging = false;
    private dragStartY = 0;
    private dragStartScrollY = 0;

    awake() {
        const target = this.viewport ?? this.gameObject;
        target.display.eventMode = 'static';
        target.display.hitArea = new Rectangle(0, 0, target.width, target.height);
        target.display.on('wheel', this.handleWheel, this);
        target.display.on('pointerdown', this.handlePointerDown, this);
        target.display.on('globalpointermove', this.handleGlobalPointerMove, this);
        target.display.on('pointerup', this.handlePointerUp, this);
        target.display.on('pointerupoutside', this.handlePointerUp, this);
        target.display.on('pointercancel', this.handlePointerUp, this);
        this.applyScroll();
    }

    get maxScrollY() {
        const viewport = this.viewport ?? this.gameObject;
        return Math.max(0, this.contentHeight - viewport.height);
    }

    public scrollTo(y: number) {
        this.scrollY = Math.min(Math.max(0, y), this.maxScrollY);
        this.applyScroll();
    }

    public scrollBy(deltaY: number) {
        this.scrollTo(this.scrollY + deltaY);
    }

    private applyScroll() {
        if (this.content) {
            this.content.y = -this.scrollY;
        }
    }

    private handleWheel(event: FederatedWheelEvent) {
        if (this.maxScrollY <= 0) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        this.scrollBy(event.deltaY * this.wheelSensitivity);
    }

    private handlePointerDown(event: FederatedPointerEvent) {
        if (!this.dragEnabled || this.maxScrollY <= 0) {
            return;
        }
        this.dragging = true;
        this.dragStartY = event.global.y;
        this.dragStartScrollY = this.scrollY;
        event.stopPropagation();
    }

    private handleGlobalPointerMove(event: FederatedPointerEvent) {
        if (!this.dragging) {
            return;
        }
        this.scrollTo(this.dragStartScrollY - (event.global.y - this.dragStartY));
        event.stopPropagation();
    }

    private handlePointerUp() {
        this.dragging = false;
    }

    onDestroy() {
        const target = this.viewport ?? this.gameObject;
        target.display.off('wheel', this.handleWheel, this);
        target.display.off('pointerdown', this.handlePointerDown, this);
        target.display.off('globalpointermove', this.handleGlobalPointerMove, this);
        target.display.off('pointerup', this.handlePointerUp, this);
        target.display.off('pointerupoutside', this.handlePointerUp, this);
        target.display.off('pointercancel', this.handlePointerUp, this);
    }
}
