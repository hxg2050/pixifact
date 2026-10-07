import { Group } from 'pixifact/runtime';
import { createEvent, event, prop, scene } from 'pixifact/scene';

@scene()
export class Dialog extends Group {
    @prop({ default: '确认操作' })
    declare title: string;

    @prop({ default: '是否继续？' })
    declare message: string;

    @prop({ default: '确定' })
    declare confirmText: string;

    @prop({ default: '取消' })
    declare cancelText: string;

    @event()
    readonly confirmed = createEvent();

    @event()
    readonly cancelled = createEvent();

    confirm() {
        this.confirmed.emit();
    }

    cancel() {
        this.cancelled.emit();
    }
}
