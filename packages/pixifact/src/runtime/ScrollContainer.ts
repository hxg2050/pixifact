import {
    Container,
    Graphics,
    Ticker,
    type ContainerChild,
    type DestroyOptions,
    type FederatedPointerEvent,
    type FederatedWheelEvent,
    type Ticker as PixiTicker,
} from 'pixi.js';
import { Control } from './Control';
import type { GroupOptions } from './Group';

export type ScrollDirection = 'vertical' | 'horizontal' | 'both';

export type ScrollContainerOptions = GroupOptions & {
    direction?: ScrollDirection;
    scrollX?: number;
    scrollY?: number;
};

const elasticResistance = 0.5;
const inertiaFriction = 0.92;
const springStrength = 0.18;
const springFriction = 0.72;
const settleDistance = 0.05;
const settleVelocity = 0.05;

export class ScrollContainer extends Control {
    readonly contentLayer = new Container();

    #mask = new Graphics();
    #direction: ScrollDirection = 'vertical';
    #targetScrollX = 0;
    #targetScrollY = 0;
    #scrollX = 0;
    #scrollY = 0;
    #velocityX = 0;
    #velocityY = 0;
    #animating = false;
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
        this.#stopMomentum();
        this.#direction = value;
        this.#applyScroll();
    }

    get scrollX() {
        return this.#scrollX;
    }

    set scrollX(value: number) {
        this.#stopMomentum();
        this.#targetScrollX = value;
        this.#applyScroll();
    }

    get scrollY() {
        return this.#scrollY;
    }

    set scrollY(value: number) {
        this.#stopMomentum();
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
        this.#stopMomentum();
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
        this.#stopMomentum();
        const beforeX = this.#scrollX;
        const beforeY = this.#scrollY;
        if (this.#direction !== 'vertical') {
            this.#targetScrollX = this.#scrollX + event.deltaX;
        }
        if (this.#direction !== 'horizontal') {
            this.#targetScrollY = this.#scrollY + event.deltaY;
        }
        this.#applyScroll();
        if (beforeX !== this.#scrollX || beforeY !== this.#scrollY) {
            event.preventDefault();
            event.stopPropagation();
        }
    }

    #handlePointerDown(event: FederatedPointerEvent) {
        this.#stopMomentum();
        this.#velocityX = 0;
        this.#velocityY = 0;
        this.#drag = {
            pointerId: event.pointerId,
            globalX: event.global.x,
            globalY: event.global.y,
            scrollX: this.#scrollX,
            scrollY: this.#scrollY,
        };
    }

    #handleGlobalPointerMove(event: FederatedPointerEvent) {
        if (!this.#drag || event.pointerId !== this.#drag.pointerId) {
            return;
        }
        const deltaX = event.global.x - this.#drag.globalX;
        const deltaY = event.global.y - this.#drag.globalY;
        const beforeX = this.#scrollX;
        const beforeY = this.#scrollY;
        if (this.#direction !== 'vertical') {
            this.#drag.scrollX -= deltaX;
            this.#targetScrollX = this.#drag.scrollX;
        }
        if (this.#direction !== 'horizontal') {
            this.#drag.scrollY -= deltaY;
            this.#targetScrollY = this.#drag.scrollY;
        }
        this.#applyElasticScroll();
        this.#velocityX = this.#scrollX - beforeX;
        this.#velocityY = this.#scrollY - beforeY;
        this.#drag.globalX = event.global.x;
        this.#drag.globalY = event.global.y;
    }

    #handlePointerUp(event: FederatedPointerEvent) {
        if (!this.#drag || event.pointerId !== this.#drag.pointerId) {
            return;
        }
        this.#drag = undefined;
        this.#startMomentum();
    }

    #syncMask() {
        this.#mask.clear();
        this.#mask.rect(0, 0, this.width, this.height).fill(0xffffff);
    }

    #applyScroll() {
        const limits = this.#scrollLimits();
        this.#setScrollPosition(
            clamp(this.#direction === 'vertical' ? 0 : this.#targetScrollX, 0, limits.x),
            clamp(this.#direction === 'horizontal' ? 0 : this.#targetScrollY, 0, limits.y),
        );
    }

    #applyElasticScroll() {
        const limits = this.#scrollLimits();
        this.#setScrollPosition(
            this.#direction === 'vertical' ? 0 : elasticClamp(this.#targetScrollX, 0, limits.x),
            this.#direction === 'horizontal' ? 0 : elasticClamp(this.#targetScrollY, 0, limits.y),
        );
    }

    #setScrollPosition(scrollX: number, scrollY: number) {
        this.#scrollX = scrollX;
        this.#scrollY = scrollY;
        this.contentLayer.position.set(-this.#scrollX, -this.#scrollY);
    }

    #scrollLimits() {
        const size = this.#contentSize();
        return {
            x: Math.max(0, size.width - this.width),
            y: Math.max(0, size.height - this.height),
        };
    }

    #startMomentum() {
        if (this.#animating || !this.#needsMomentum()) {
            return;
        }
        this.#animating = true;
        Ticker.shared.add(this.#handleTick, this);
    }

    #stopMomentum() {
        if (!this.#animating) {
            return;
        }
        Ticker.shared.remove(this.#handleTick, this);
        this.#animating = false;
    }

    #handleTick(ticker: PixiTicker) {
        if (this.#destroying || this.destroyed || this.#drag) {
            this.#stopMomentum();
            return;
        }

        const deltaTime = Math.min(ticker.deltaTime, 4);
        const limits = this.#scrollLimits();
        const nextX = this.#direction === 'vertical'
            ? { value: 0, velocity: 0 }
            : stepMomentumAxis(this.#scrollX, this.#velocityX, 0, limits.x, deltaTime);
        const nextY = this.#direction === 'horizontal'
            ? { value: 0, velocity: 0 }
            : stepMomentumAxis(this.#scrollY, this.#velocityY, 0, limits.y, deltaTime);

        this.#velocityX = nextX.velocity;
        this.#velocityY = nextY.velocity;
        this.#setScrollPosition(nextX.value, nextY.value);
        this.#targetScrollX = this.#scrollX;
        this.#targetScrollY = this.#scrollY;

        if (!this.#needsMomentum()) {
            this.#stopMomentum();
        }
    }

    #needsMomentum() {
        const limits = this.#scrollLimits();
        return this.#direction !== 'vertical' && needsMomentumAxis(this.#scrollX, this.#velocityX, 0, limits.x)
            || this.#direction !== 'horizontal' && needsMomentumAxis(this.#scrollY, this.#velocityY, 0, limits.y);
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

function elasticClamp(value: number, min: number, max: number) {
    if (value < min) {
        return min + (value - min) * elasticResistance;
    }
    if (value > max) {
        return max + (value - max) * elasticResistance;
    }
    return value;
}

function stepMomentumAxis(value: number, velocity: number, min: number, max: number, deltaTime: number) {
    let nextVelocity = velocity;
    const bound = nearestBound(value, min, max);
    if (bound === undefined) {
        nextVelocity *= Math.pow(inertiaFriction, deltaTime);
    } else {
        nextVelocity += (bound - value) * springStrength * deltaTime;
        nextVelocity *= Math.pow(springFriction, deltaTime);
    }

    let nextValue = value + nextVelocity * deltaTime;
    const nextBound = nearestBound(nextValue, min, max);
    if (bound !== undefined && nextBound === undefined) {
        return {
            value: bound,
            velocity: 0,
        };
    }
    if (
        nextBound !== undefined
        && Math.abs(nextValue - nextBound) <= settleDistance
        && Math.abs(nextVelocity) <= settleVelocity
    ) {
        nextValue = nextBound;
        nextVelocity = 0;
    }

    return {
        value: nextValue,
        velocity: nextVelocity,
    };
}

function needsMomentumAxis(value: number, velocity: number, min: number, max: number) {
    return Math.abs(velocity) > settleVelocity || nearestBound(value, min, max) !== undefined;
}

function nearestBound(value: number, min: number, max: number) {
    if (value < min) {
        return min;
    }
    if (value > max) {
        return max;
    }
    return undefined;
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
