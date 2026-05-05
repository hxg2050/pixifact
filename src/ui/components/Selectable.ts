import { Component, ComponentMeta, Prop } from "../../core";
import type { FederatedPointerEvent } from "pixi.js";
import type { Group } from "../../core";
import type { RoundedRectGraphic } from "../graphics";

export enum SelectionState {
    Normal = 'normal',
    Highlighted = 'highlighted',
    Pressed = 'pressed',
    Disabled = 'disabled',
}

@ComponentMeta({
    type: 'ui.Selectable',
    displayName: 'Selectable',
    category: 'UI/Interaction',
    description: 'Base class for pointer-driven selectable controls.',
})
export class Selectable extends Component<Group> {
    @Prop({ type: 'boolean', default: true })
    public interactable = true;

    @Prop({
        type: 'componentRef',
        component: 'ui.Graphic',
        description: 'Graphic changed by this selectable transition.',
    })
    public targetGraphic?: RoundedRectGraphic;

    @Prop({
        type: 'enum',
        default: 'colorTint',
        options: ['none', 'colorTint', 'scale'],
    })
    public transition: 'none' | 'colorTint' | 'scale' = 'colorTint';

    @Prop({ type: 'color', default: 0x2563eb })
    public normalColor = 0x2563eb;

    @Prop({ type: 'color', default: 0x1d4ed8 })
    public highlightedColor = 0x1d4ed8;

    @Prop({ type: 'color', default: 0x1e40af })
    public pressedColor = 0x1e40af;

    @Prop({ type: 'color', default: 0x94a3b8 })
    public disabledColor = 0x94a3b8;

    @Prop({ type: 'number', default: 0.96, min: 0 })
    public pressedScale = 0.96;

    protected hovered = false;
    protected pressed = false;

    awake() {
        this.gameObject.display.eventMode = this.interactable ? 'static' : 'none';
        this.gameObject.display.cursor = this.interactable ? 'pointer' : 'default';
        this.gameObject.display.on('pointerover', this.handlePointerOver, this);
        this.gameObject.display.on('pointerout', this.handlePointerOut, this);
        this.gameObject.display.on('pointerdown', this.handlePointerDown, this);
        this.gameObject.display.on('pointerup', this.handlePointerUp, this);
        this.gameObject.display.on('pointerupoutside', this.handlePointerCancel, this);
        this.gameObject.display.on('pointercancel', this.handlePointerCancel, this);
        this.applyState();
    }

    protected handlePointerOver(_event: FederatedPointerEvent) {
        if (!this.interactable) {
            return;
        }
        this.hovered = true;
        this.applyState();
    }

    protected handlePointerOut(_event: FederatedPointerEvent) {
        this.hovered = false;
        this.pressed = false;
        this.applyState();
    }

    protected handlePointerDown(_event: FederatedPointerEvent) {
        if (!this.interactable) {
            return;
        }
        this.pressed = true;
        this.applyState();
    }

    protected handlePointerUp(_event: FederatedPointerEvent) {
        if (!this.interactable) {
            return;
        }
        this.pressed = false;
        this.applyState();
    }

    protected handlePointerCancel(_event: FederatedPointerEvent) {
        this.pressed = false;
        this.applyState();
    }

    protected get state() {
        if (!this.interactable) {
            return SelectionState.Disabled;
        }
        if (this.pressed) {
            return SelectionState.Pressed;
        }
        if (this.hovered) {
            return SelectionState.Highlighted;
        }
        return SelectionState.Normal;
    }

    protected applyState() {
        this.gameObject.display.eventMode = this.interactable ? 'static' : 'none';
        this.gameObject.display.cursor = this.interactable ? 'pointer' : 'default';

        if (this.transition === 'colorTint' && this.targetGraphic) {
            this.targetGraphic.color = this.currentColor;
            this.targetGraphic.setDirty();
        }

        if (this.transition === 'scale') {
            const scale = this.state === SelectionState.Pressed ? this.pressedScale : 1;
            this.gameObject.scaleX = scale;
            this.gameObject.scaleY = scale;
        }
    }

    private get currentColor() {
        switch (this.state) {
            case SelectionState.Disabled:
                return this.disabledColor;
            case SelectionState.Pressed:
                return this.pressedColor;
            case SelectionState.Highlighted:
                return this.highlightedColor;
            default:
                return this.normalColor;
        }
    }

    onDestroy() {
        this.gameObject.display.off('pointerover', this.handlePointerOver, this);
        this.gameObject.display.off('pointerout', this.handlePointerOut, this);
        this.gameObject.display.off('pointerdown', this.handlePointerDown, this);
        this.gameObject.display.off('pointerup', this.handlePointerUp, this);
        this.gameObject.display.off('pointerupoutside', this.handlePointerCancel, this);
        this.gameObject.display.off('pointercancel', this.handlePointerCancel, this);
    }
}
