import type { GameObject } from "./GameObject";
import type { Group } from "./group";

export const GameObjectEvent = {
    /**
     * 当添加到显示舞台时
     */
    ADDED: 'added',
    /**
     * 当添加新的子节点时
     */
    CHILD_ADDED: 'childAdded',

    /**
     * 移除时
     */
    REMOVED: 'removed',

    /**
     * 移除子元素时
     */
    CHILD_REMOVED: 'childRemoved',

    /**
     * 尺寸发生变化时
     */
    RESIZE: 'resize',
    /**
     * 位置发生变化
     */
    REPOSITION: 'reposition',
    /**
     * 变换发生变化
     */
    TRANSFORM_CHANGE: 'transformChange',

    /**
     * 帧刷新前
     */
    TICKER_BEFORE: 'tickerBefore',

    /**
     * 帧刷新后
     */
    TICKER_AFTER: 'tickerAfter'
} as const;

export interface GameObjectEventMap {
    [event: string]: any[];
    [GameObjectEvent.ADDED]: [parent: Group];
    [GameObjectEvent.CHILD_ADDED]: [child: GameObject];
    [GameObjectEvent.REMOVED]: [parent: Group];
    [GameObjectEvent.CHILD_REMOVED]: [child: GameObject];
    [GameObjectEvent.RESIZE]: [];
    [GameObjectEvent.REPOSITION]: [];
    [GameObjectEvent.TRANSFORM_CHANGE]: [];
    [GameObjectEvent.TICKER_BEFORE]: [dt: number];
    [GameObjectEvent.TICKER_AFTER]: [dt: number];
}
