import { Component, ComponentMeta, GameObject, Prop } from "../../core";
import type { Group } from "../../core";
import type { RoundedRectGraphic } from "../graphics";

@ComponentMeta({
    type: 'ui.ProgressBar',
    displayName: 'Progress Bar',
    category: 'UI/Display',
    description: 'Controls a fill node or graphic based on a normalized value.',
    disallowMultiple: true,
})
export class ProgressBar extends Component<Group> {
    @Prop({ type: 'number', default: 0, min: 0, max: 1 })
    public value = 0;

    @Prop({ type: 'number', default: 0 })
    public min = 0;

    @Prop({ type: 'number', default: 1 })
    public max = 1;

    @Prop({
        type: 'nodeRef',
        description: 'Node resized horizontally to represent the current value.',
    })
    public fillNode?: Group;

    @Prop({
        type: 'componentRef',
        component: 'ui.Graphic',
        description: 'Optional fill graphic redrawn when value changes.',
    })
    public fillGraphic?: RoundedRectGraphic;

    awake() {
        this.gameObject.emitter.on(GameObject.Event.RESIZE, this.applyValue, this);
        this.applyValue();
    }

    public setValue(value: number) {
        this.value = value;
        this.applyValue();
    }

    public applyValue = () => {
        const range = this.max - this.min;
        const normalized = range === 0 ? 0 : Math.min(1, Math.max(0, (this.value - this.min) / range));

        if (this.fillNode) {
            this.fillNode.width = this.gameObject.width * normalized;
            this.fillNode.height = this.gameObject.height;
        }

        this.fillGraphic?.setDirty();
    };

    onDestroy() {
        this.gameObject.emitter.off(GameObject.Event.RESIZE, this.applyValue, this);
    }
}
