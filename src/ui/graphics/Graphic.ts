import { Container } from "pixi.js";
import { Component, ComponentMeta, Prop } from "../../core";
import type { Group } from "../../core";

@ComponentMeta({
    type: 'ui.Graphic',
    displayName: 'Graphic',
    category: 'UI/Graphic',
    description: 'Base class for renderable UI graphics.',
})
export abstract class Graphic<TDisplay extends Container = Container> extends Component<Group> {
    public display!: TDisplay;
    private _dirty = true;

    @Prop({
        type: 'boolean',
        default: true,
        description: 'Whether this graphic can be used as an interaction raycast target.',
    })
    public raycastTarget = true;

    awake() {
        this.createDisplay();
        this.gameObject.display.addChild(this.display);
        this.redrawNow();
    }

    protected abstract createDisplay(): void;

    protected abstract redraw(): void;

    public setDirty() {
        this._dirty = true;
        this.redrawNow();
    }

    private redrawNow() {
        if (!this._dirty || !this.display) {
            return;
        }
        this._dirty = false;
        this.redraw();
    }

    onDestroy() {
        this.display?.destroy();
    }
}
