import { Group } from 'pixifact/runtime';
import { createEvent, event, part, scene } from 'pixifact/compiler';
import type { Button } from './Button';

@scene()
export class BottomMenu extends Group {
    @part()
    protected declare bagButton: Button;

    @event({ name: 'openInventory' })
    readonly openInventory = createEvent();

    emitOpenInventory() {
        this.openInventory.emit();
    }
}
