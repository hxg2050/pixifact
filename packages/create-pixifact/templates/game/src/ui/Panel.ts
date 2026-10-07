import { Group } from 'pixifact/runtime';
import { prop, scene, slot } from 'pixifact/scene';

@scene()
export class Panel extends Group {
    @prop({ default: '面板' })
    declare title: string;

    @slot()
    declare readonly content: Group;
}
