import type { FederatedPointerEvent } from "pixi.js";
import { ComponentMeta, Prop } from "../../runtime";
import { Selectable } from "./Selectable";

@ComponentMeta({
    type: 'ui.Button',
    displayName: 'Button',
    category: 'UI/Interaction',
    icon: 'mouse-pointer',
    description: 'Handles pointer interaction and invokes an action when clicked.',
    disallowMultiple: true,
})
export class Button extends Selectable {
    @Prop({
        type: 'event',
        description: 'Action invoked when the button receives a pointer tap.',
    })
    public onClick?: string | ((event: FederatedPointerEvent) => void);

    awake() {
        super.awake();
        this.gameObject.display.on('pointertap', this.handlePointerTap, this);
    }

    private handlePointerTap(event: FederatedPointerEvent) {
        if (!this.interactable) {
            return;
        }

        if (typeof this.onClick === 'function') {
            this.onClick(event);
        }
        this.gameObject.emitter.emit('tap', event);
    }

    override onDestroy() {
        this.gameObject.display.off('pointertap', this.handlePointerTap, this);
        super.onDestroy();
    }
}
