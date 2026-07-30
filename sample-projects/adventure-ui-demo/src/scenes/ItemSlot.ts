import { Group } from 'pixifact/runtime';
import { defineVariants, prop, scene } from 'pixifact/scene';

const itemStates = defineVariants({
    normal: { tint: '#ffffff' },
    selected: { tint: '#ffd978' },
});

@scene()
export class ItemSlot extends Group {
    @prop({ default: '药水' })
    declare itemName: string;

    @prop({ default: 1 })
    declare quantity: number;

    @prop({ default: 'normal', variants: itemStates })
    declare state: keyof typeof itemStates;
}
