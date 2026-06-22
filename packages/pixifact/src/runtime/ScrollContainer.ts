import {
    Container,
    Graphics,
    type ContainerChild,
    type DestroyOptions,
    type FederatedPointerEvent,
    type FederatedWheelEvent,
} from 'pixi.js';
import { Control } from './Control';
import type { GroupOptions } from './Group';

export type ScrollDirection = 'vertical' | 'horizontal' | 'both';

export type ScrollContainerOptions = GroupOptions & {
    direction?: ScrollDirection;
    scrollX?: number;
    scrollY?: number;
};

export class ScrollContainer extends Control {
    readonly contentLayer = new Container();

    #mask = new Graphics();
    #direction: ScrollDirection = 'vertical';
    #targetScrollX = 0;
    #targetScrollY = 0;
    #scrollX = 0;
    #scrollY = 0;
    #watchedContent = new Set<ContainerChild>();
    #destroying = false;
    #drag:
        | {
            pointerId: number;
            globalX: number;
            globalY: number;
            scrollX: number;
            scrollY: number;
        }
        | undefined;

    constructor(options: ScrollContainerOptions = {}) {
        const { direction, scrollX, scrollY, ...groupOptions } = options;
        super(groupOptions);

        this.#direction = direction ?? this.#direction;
        this.#targetScrollX = scrollX ?? this.#targetScrollX;
        this.#targetScrollY = scrollY ?? this.#targetScrollY;
        this.eventMode = 'static';
        this.contentLayer.mask = this.#mask;
        this.contentLayer.on('childAdded', this.#handleContentChildAdded, this);
        this.contentLayer.on('childRemoved', this.#handleContentChildRemoved, this);
        super.addChild(this.contentLayer);
        super.addChild(this.#mask);
        this.on('wheel', this.#handleWheel, this);
        this.on('pointerdown', this.#handlePointerDown, this);
        this.on('globalpointermove', this.#handleGlobalPointerMove, this);
        this.on('pointerup', this.#handlePointerUp, this);
        this.on('pointerupoutside', this.#handlePointerUp, this);
        this.on('pointercancel', this.#handlePointerUp, this);
        this.layout();
    }

    get direction() {
        return this.#direction;
    }

    set direction(value: ScrollDirection) {
        this.#direction = value;
        this.#applyScroll();
    }

    get scrollX() {
        return this.#scrollX;
    }

    set scrollX(value: number) {
        this.#targetScrollX = value;
        this.#applyScroll();
    }

    get scrollY() {
        return this.#scrollY;
    }

    set scrollY(value: number) {
        this.#targetScrollY = value;
        this.#applyScroll();
    }

    override addChild<U extends ContainerChild[]>(...children: U): U[0] {
        const child = this.contentLayer.addChild(...children);
        this.layout();
        return child;
    }

    override addChildAt<U extends ContainerChild>(child: U, index: number): U {
        const added = this.contentLayer.addChildAt(child, index);
        this.layout();
        return added;
    }

    override removeChild<U extends ContainerChild[]>(...children: U): U[0] {
        const allContentChildren = children.every((child) => child.parent === this.contentLayer);
        const child = allContentChildren
            ? this.contentLayer.removeChild(...children)
            : super.removeChild(...children);
        this.layout();
        return child;
    }

    override setChildIndex(child: ContainerChild, index: number) {
        if (child.parent === this.contentLayer) {
            this.contentLayer.setChildIndex(child, index);
        } else {
            super.setChildIndex(child, index);
        }
        this.layout();
    }

    override getChildIndex(child: ContainerChild) {
        return child.parent === this.contentLayer
            ? this.contentLayer.getChildIndex(child)
            : super.getChildIndex(child);
    }

    override swapChildren(child: ContainerChild, child2: ContainerChild) {
        if (child.parent === this.contentLayer && child2.parent === this.contentLayer) {
            this.contentLayer.swapChildren(child, child2);
        } else {
            super.swapChildren(child, child2);
        }
        this.layout();
    }

    override layout() {
        if (this.#destroying || this.destroyed) {
            return;
        }
        super.layout();
        this.#syncMask();
        this.#applyScroll();
    }

    override destroy(options?: DestroyOptions) {
        this.#destroying = true;
        this.contentLayer.off('childAdded', this.#handleContentChildAdded, this);
        this.contentLayer.off('childRemoved', this.#handleContentChildRemoved, this);
        for (const child of this.#watchedContent) {
            child.off('childAdded', this.#handleWatchedContentChildAdded, this);
            child.off('childRemoved', this.#handleWatchedContentChildRemoved, this);
        }
        this.#watchedContent.clear();
        super.destroy(options);
    }

    #handleContentChildAdded(child: ContainerChild) {
        this.#watchContentSubtree(child);
        this.layout();
    }

    #handleContentChildRemoved(child: ContainerChild) {
        this.#unwatchContentSubtree(child);
        this.layout();
    }

    #handleWatchedContentChildAdded(child: ContainerChild) {
        this.#watchContentSubtree(child);
        this.layout();
    }

    #handleWatchedContentChildRemoved(child: ContainerChild) {
        this.#unwatchContentSubtree(child);
        this.layout();
    }

    #watchContentSubtree(child: ContainerChild) {
        if (this.#watchedContent.has(child)) {
            return;
        }
        this.#watchedContent.add(child);
        child.on('childAdded', this.#handleWatchedContentChildAdded, this);
        child.on('childRemoved', this.#handleWatchedContentChildRemoved, this);
        for (const descendant of child.children) {
            this.#watchContentSubtree(descendant);
        }
    }

    #unwatchContentSubtree(child: ContainerChild) {
        if (!this.#watchedContent.delete(child)) {
            return;
        }
        child.off('childAdded', this.#handleWatchedContentChildAdded, this);
        child.off('childRemoved', this.#handleWatchedContentChildRemoved, this);
        for (const descendant of child.children) {
            this.#unwatchContentSubtree(descendant);
        }
    }

    #handleWheel(event: FederatedWheelEvent) {
        const beforeX = this.#scrollX;
        const beforeY = this.#scrollY;
        if (this.#direction !== 'vertical') {
            this.#targetScrollX += event.deltaX;
        }
        if (this.#direction !== 'horizontal') {
            this.#targetScrollY += event.deltaY;
        }
        this.#applyScroll();
        if (beforeX !== this.#scrollX || beforeY !== this.#scrollY) {
            event.preventDefault();
            event.stopPropagation();
        }
    }

    #handlePointerDown(event: FederatedPointerEvent) {
        this.#drag = {
            pointerId: event.pointerId,
            globalX: event.global.x,
            globalY: event.global.y,
            scrollX: this.#targetScrollX,
            scrollY: this.#targetScrollY,
        };
    }

    #handleGlobalPointerMove(event: FederatedPointerEvent) {
        if (!this.#drag || event.pointerId !== this.#drag.pointerId) {
            return;
        }
        const deltaX = event.global.x - this.#drag.globalX;
        const deltaY = event.global.y - this.#drag.globalY;
        if (this.#direction !== 'vertical') {
            this.#targetScrollX = this.#drag.scrollX - deltaX;
        }
        if (this.#direction !== 'horizontal') {
            this.#targetScrollY = this.#drag.scrollY - deltaY;
        }
        this.#applyScroll();
    }

    #handlePointerUp(event: FederatedPointerEvent) {
        if (!this.#drag || event.pointerId !== this.#drag.pointerId) {
            return;
        }
        this.#drag = undefined;
    }

    #syncMask() {
        this.#mask.clear();
        this.#mask.rect(0, 0, this.width, this.height).fill(0xffffff);
    }

    #applyScroll() {
        this.#scrollX = clamp(this.#direction === 'vertical' ? 0 : this.#targetScrollX, 0, this.#maxScrollX());
        this.#scrollY = clamp(this.#direction === 'horizontal' ? 0 : this.#targetScrollY, 0, this.#maxScrollY());
        this.contentLayer.position.set(-this.#scrollX, -this.#scrollY);
    }

    #maxScrollX() {
        return Math.max(0, this.#contentSize().width - this.width);
    }

    #maxScrollY() {
        return Math.max(0, this.#contentSize().height - this.height);
    }

    #contentSize() {
        let width = 0;
        let height = 0;
        for (const child of this.contentLayer.children) {
            const bounds = transformedLocalBounds(child);
            width = Math.max(width, bounds.right);
            height = Math.max(height, bounds.bottom);
        }
        return { width, height };
    }
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function transformedLocalBounds(child: ContainerChild) {
    child.updateLocalTransform();
    const bounds = child.getLocalBounds();
    if (!bounds.isValid) {
        return { right: 0, bottom: 0 };
    }

    const transform = child.localTransform;
    const x0 = transform.a * bounds.minX + transform.c * bounds.minY + transform.tx;
    const y0 = transform.b * bounds.minX + transform.d * bounds.minY + transform.ty;
    const x1 = transform.a * bounds.maxX + transform.c * bounds.minY + transform.tx;
    const y1 = transform.b * bounds.maxX + transform.d * bounds.minY + transform.ty;
    const x2 = transform.a * bounds.maxX + transform.c * bounds.maxY + transform.tx;
    const y2 = transform.b * bounds.maxX + transform.d * bounds.maxY + transform.ty;
    const x3 = transform.a * bounds.minX + transform.c * bounds.maxY + transform.tx;
    const y3 = transform.b * bounds.minX + transform.d * bounds.maxY + transform.ty;

    return {
        right: Math.max(0, x0, x1, x2, x3),
        bottom: Math.max(0, y0, y1, y2, y3),
    };
}
