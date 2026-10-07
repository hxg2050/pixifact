import { Group } from 'pixifact/runtime';
import { createEvent, event, prop, scene } from 'pixifact/scene';

@scene()
export class ResultScreen extends Group {
    @prop({ default: '本局 · 8 份星光' })
    declare scoreText: string;

    @prop({ default: '最高记录 · 8' })
    declare bestText: string;

    @event()
    readonly restarted = createEvent();

    @event()
    readonly returned = createEvent();

    restart() {
        this.restarted.emit();
    }

    menu() {
        this.returned.emit();
    }
}
