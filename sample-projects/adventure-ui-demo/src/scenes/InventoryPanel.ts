import type { Text } from 'pixi.js';
import { Group } from 'pixifact/runtime';
import { part, scene } from 'pixifact/compiler';
import type { Button } from './Button';
import type { ItemSlot } from './ItemSlot';

@scene()
export class InventoryPanel extends Group {
    @part()
    protected declare titleText: Text;

    @part()
    protected declare firstSlot: ItemSlot;

    @part()
    protected declare sortButton: Button;
}
