import { Component, ComponentMeta, Prop } from "../../runtime";
import type { Group } from "../../runtime";
import type { TextGraphic } from "../graphics";

@ComponentMeta({
    type: 'ui.InputField',
    displayName: 'Input Field',
    category: 'UI/Input',
    description: 'Stores editable text state and can drive text graphic placeholders.',
    disallowMultiple: true,
})
export class InputField extends Component<Group> {
    @Prop({ type: 'string', default: '' })
    public value = '';

    @Prop({ type: 'string', default: '' })
    public placeholder = '';

    @Prop({ type: 'boolean', default: false })
    public multiline = false;

    @Prop({
        type: 'componentRef',
        component: 'ui.TextGraphic',
        description: 'Text graphic used to display the current value or placeholder.',
    })
    public textGraphic?: TextGraphic;

    awake() {
        this.applyText();
    }

    public setValue(value: string) {
        this.value = value;
        this.applyText();
    }

    public applyText() {
        if (!this.textGraphic) {
            return;
        }
        this.textGraphic.text = this.value || this.placeholder;
        this.textGraphic.setDirty();
    }
}
