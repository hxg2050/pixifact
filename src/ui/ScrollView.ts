import { FederatedPointerEvent, FederatedWheelEvent, Rectangle } from "pixi.js";
import { GameObject, Graphics, Group } from "../core";

export class ScrollView extends Group {
    public content!: Group;
    public maskGraphic!: Graphics;
    public scrollbar!: Graphics;

    public wheelSpeed = 1;
    public dragEnabled = true;
    public scrollbarWidth = 6;
    public scrollbarInset = 4;
    public scrollbarMinHeight = 28;
    public scrollbarColor = 0x64748b;
    public scrollbarAlpha = 0.55;

    private _contentHeight = 0;
    private _scrollY = 0;
    private _dragging = false;
    private _dragStartGlobalY = 0;
    private _dragStartScrollY = 0;

    get contentHeight() {
        return this._contentHeight;
    }
    set contentHeight(val: number) {
        this._contentHeight = Math.max(0, val);
        this.applyScroll();
    }

    get scrollY() {
        return this._scrollY;
    }
    set scrollY(val: number) {
        this.setScrollY(val);
    }

    get maxScrollY() {
        return Math.max(0, this.contentHeight - this.height);
    }

    set width(val: number) {
        super.width = val;
        this.refreshView();
    }
    get width() {
        return super.width;
    }

    set height(val: number) {
        super.height = val;
        this.refreshView();
    }
    get height() {
        return super.height;
    }

    public render() {
        this.maskGraphic = GameObject.instantiate(Graphics, this);
        this.content = GameObject.instantiate(Group, this);
        this.scrollbar = GameObject.instantiate(Graphics, this);

        this.content.display.mask = this.maskGraphic.display;
        this.display.eventMode = 'static';
        this.display.hitArea = new Rectangle(0, 0, this.width, this.height);
        this.display.on('wheel', this.handleWheel, this);
        this.display.on('pointerdown', this.handlePointerDown, this);
        this.display.on('globalpointermove', this.handleGlobalPointerMove, this);
        this.display.on('pointerup', this.handlePointerUp, this);
        this.display.on('pointerupoutside', this.handlePointerUp, this);
        this.display.on('pointercancel', this.handlePointerUp, this);
        this.display.once('destroyed', this.onDestroy, this);

        this.refreshView();
    }

    public scrollTo(y: number) {
        this.setScrollY(y);
    }

    public scrollBy(deltaY: number) {
        this.setScrollY(this.scrollY + deltaY);
    }

    public refreshContentHeight() {
        let height = 0;
        for (const child of this.content.children) {
            height = Math.max(height, child.y + child.height);
        }
        this.contentHeight = height;
    }

    private setScrollY(y: number) {
        const next = Math.min(Math.max(0, y), this.maxScrollY);
        if (this._scrollY === next) {
            this.applyScroll();
            return;
        }
        this._scrollY = next;
        this.applyScroll();
    }

    private applyScroll() {
        if (this.content) {
            this.content.y = this._scrollY === 0 ? 0 : -this._scrollY;
        }
        this.drawScrollbar();
    }

    private refreshView() {
        if (!this.maskGraphic) {
            return;
        }
        this.maskGraphic.clear()
            .rect(0, 0, this.width, this.height)
            .fill(0xffffff);
        this.display.hitArea = new Rectangle(0, 0, this.width, this.height);
        this.setScrollY(this._scrollY);
    }

    private drawScrollbar() {
        if (!this.scrollbar) {
            return;
        }

        this.scrollbar.clear();
        if (this.maxScrollY <= 0 || this.height <= 0 || this.contentHeight <= 0) {
            return;
        }

        const trackHeight = Math.max(0, this.height - this.scrollbarInset * 2);
        const thumbHeight = Math.min(
            trackHeight,
            Math.max(this.scrollbarMinHeight, trackHeight * (this.height / this.contentHeight)),
        );
        const travel = Math.max(0, trackHeight - thumbHeight);
        const y = this.scrollbarInset + travel * (this.scrollY / this.maxScrollY);
        const x = this.width - this.scrollbarInset - this.scrollbarWidth;

        this.scrollbar
            .roundRect(x, y, this.scrollbarWidth, thumbHeight, this.scrollbarWidth / 2)
            .fill({ color: this.scrollbarColor, alpha: this.scrollbarAlpha });
    }

    private handleWheel(event: FederatedWheelEvent) {
        if (this.maxScrollY <= 0) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        this.scrollBy(event.deltaY * this.wheelSpeed);
    }

    private handlePointerDown(event: FederatedPointerEvent) {
        if (!this.dragEnabled || this.maxScrollY <= 0) {
            return;
        }
        this._dragging = true;
        this._dragStartGlobalY = event.global.y;
        this._dragStartScrollY = this.scrollY;
        event.stopPropagation();
    }

    private handleGlobalPointerMove(event: FederatedPointerEvent) {
        if (!this._dragging) {
            return;
        }
        const deltaY = event.global.y - this._dragStartGlobalY;
        this.scrollTo(this._dragStartScrollY - deltaY);
        event.stopPropagation();
    }

    private handlePointerUp() {
        this._dragging = false;
    }

    public onDestroy() {
        this.display.off('wheel', this.handleWheel, this);
        this.display.off('pointerdown', this.handlePointerDown, this);
        this.display.off('globalpointermove', this.handleGlobalPointerMove, this);
        this.display.off('pointerup', this.handlePointerUp, this);
        this.display.off('pointerupoutside', this.handlePointerUp, this);
        this.display.off('pointercancel', this.handlePointerUp, this);
        this.display.off('destroyed', this.onDestroy, this);
    }
}
