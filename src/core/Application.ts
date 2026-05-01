import * as PIXI from 'pixi.js';
import { Group } from './group';
export class Application extends PIXI.Application {
    root!: Group;

    public async init(options?: Partial<PIXI.ApplicationOptions>) {
        await super.init(options);

        this.root = new Group();
        this.root.display = this.stage;
        this.root.width = this.screen.width
        this.root.height = this.screen.height;
    }
}
