import { GameObject } from "../GameObject";
import { Group } from "../group";
import { onlyOnceQueueMicrotask } from "../utils/onlyOnceQueueMicrotask";
import { Component } from "./Component";
import { Flex } from "./Flex";


export enum FlexDirection {
    ROW,
    COLUMN
}
export class FlexGroup extends Component<Group> {
    direction: FlexDirection = FlexDirection.ROW;
    gap = 0;

    awake(): void {
        this.gameObject.emitter.on(GameObject.Event.RESIZE, this.resize, this);
        this.gameObject.emitter.on(GameObject.Event.CHILD_ADDED, this.resize, this);
    }

    resize = onlyOnceQueueMicrotask(() => {
        const length = this.gameObject.children.length;
        let total = 0;
        let fix = length * this.gap;

        for (let i = 0; i < length; i ++) {
            const child = this.gameObject.getChildAt(i);
            const flex = child.getComponent(Flex);

            if (flex) {
                total += flex.grow;
            } else {
                fix += this.direction === FlexDirection.ROW ? child.width : child.height;
            }
        }

        // 起始位置
        let location = 0;
        // 可用空间
        let available = this.gameObject.width - fix;

        for (let i = 0; i < length; i ++) {
            const child = this.gameObject.getChildAt(i);
            const flex = child.getComponent(Flex);

            const perc = flex ? flex.grow / total : 0;
            
            if (this.direction === FlexDirection.ROW) {
                child.x = location;
                !!perc && (child.width = available  * perc);
                location += child.width + this.gap;
            } else {
                child.y = location;
                !!perc && (child.height = available * perc);
                location += child.height + this.gap;
            }
        }
    })

    onDestroy(): void {
        this.gameObject.emitter.off(GameObject.Event.RESIZE, this.resize, this);
        this.gameObject.emitter.off(GameObject.Event.CHILD_ADDED, this.resize, this);
    }
}
