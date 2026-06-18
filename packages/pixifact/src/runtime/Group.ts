import { Container, Rectangle, type ContainerOptions } from 'pixi.js';

export interface GroupOptions extends ContainerOptions {
    logicalWidth?: number;
    logicalHeight?: number;
}

export class Group extends Container {
    logicalWidth = 0;
    logicalHeight = 0;

    constructor(options: GroupOptions = {}) {
        const { logicalWidth, logicalHeight, ...containerOptions } = options;
        super(containerOptions);

        if (logicalWidth !== undefined || logicalHeight !== undefined) {
            this.setLogicalSize(logicalWidth ?? 0, logicalHeight ?? 0);
        }
    }

    setLogicalSize(width: number, height: number) {
        this.logicalWidth = width;
        this.logicalHeight = height;
        this.hitArea = new Rectangle(0, 0, width, height);
    }
}
