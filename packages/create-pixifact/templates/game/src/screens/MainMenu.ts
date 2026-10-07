import { Group } from 'pixifact/runtime';
import { createEvent, event, prop, scene } from 'pixifact/scene';

@scene()
export class MainMenu extends Group {
    @prop({ default: '最高记录 · 0' })
    declare bestText: string;

    @event()
    readonly started = createEvent();

    start() {
        this.started.emit();
    }
}
