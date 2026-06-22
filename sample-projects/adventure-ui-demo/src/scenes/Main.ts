import { Group } from 'pixifact/runtime';
import { part, scene } from 'pixifact/compiler';
import type { BottomMenu } from './BottomMenu';
import type { InventoryPanel } from './InventoryPanel';

@scene()
export class Main extends Group {
    @part()
    protected declare inventoryPanel: InventoryPanel;

    @part()
    protected declare bottomMenu: BottomMenu;

    toggleInventory() {
        this.inventoryPanel.visible = !this.inventoryPanel.visible;
    }
}
