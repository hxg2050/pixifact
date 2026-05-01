import { Container, Ticker } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { Component, GameObject, Graphics, Group, Image, Label, NineSliceImage } from '../src/core';
import { setProps, sp } from '../src/core/utils/setProps';
import { onlyOnceQueueMicrotask } from '../src/core/utils/onlyOnceQueueMicrotask';

class TestObject extends GameObject<Container> {
    display = new Container();
}

class TestComponent extends Component<TestObject> {
    awake = vi.fn();
    start = vi.fn();
    update = vi.fn();
    onDestroy = vi.fn();
}

describe('setProps', () => {
    it('assigns shallow properties and returns the target object', () => {
        const target = { x: 0, y: 0, label: 'old' };

        const result = setProps(target, { x: 10, label: 'new' });

        expect(result).toBe(target);
        expect(target).toEqual({ x: 10, y: 0, label: 'new' });
    });

    it('exports sp as an alias', () => {
        expect(sp).toBe(setProps);
    });
});

describe('GameObject transform', () => {
    it('syncs transform properties to the Pixi display object', () => {
        const object = new TestObject();

        object.x = 12;
        object.y = 24;
        object.scaleX = 2;
        object.scaleY = 3;
        object.rotation = 0.5;
        object.skewX = 0.25;
        object.skewY = 0.75;

        expect(object.display.x).toBe(12);
        expect(object.display.y).toBe(24);
        expect(object.display.scale.x).toBe(2);
        expect(object.display.scale.y).toBe(3);
        expect(object.display.rotation).toBe(0.5);
        expect(object.display.skew.x).toBe(0.25);
        expect(object.display.skew.y).toBe(0.75);

        object.display.destroy();
    });

    it('refreshes pivot when size or anchor changes', () => {
        const object = new Group();

        object.width = 100;
        object.height = 40;
        object.anchorX = 0.5;
        object.anchorY = 0.25;

        expect(object.display.pivot.x).toBe(50);
        expect(object.display.pivot.y).toBe(10);

        object.display.destroy();
    });
});

describe('Group children', () => {
    it('adds, removes, and reparents children with matching Pixi containers', () => {
        const firstParent = new Group();
        const secondParent = new Group();
        const child = new TestObject();
        const added = vi.fn();
        const removed = vi.fn();

        child.emitter.on(GameObject.Event.ADDED, added);
        child.emitter.on(GameObject.Event.REMOVED, removed);

        firstParent.addChild(child);

        expect(child.parent).toBe(firstParent);
        expect(firstParent.children).toEqual([child]);
        expect(firstParent.display.children).toEqual([child.display]);
        expect(added).toHaveBeenCalledWith(firstParent);

        secondParent.addChild(child);

        expect(child.parent).toBe(secondParent);
        expect(firstParent.children).toEqual([]);
        expect(firstParent.display.children).toEqual([]);
        expect(secondParent.children).toEqual([child]);
        expect(secondParent.display.children).toEqual([child.display]);
        expect(removed).toHaveBeenCalledWith(firstParent);

        const removedChild = secondParent.removeChildAt(0);

        expect(removedChild).toBe(child);
        expect(child.parent).toBeUndefined();
        expect(secondParent.children).toEqual([]);
        expect(secondParent.display.children).toEqual([]);

        child.display.destroy();
        firstParent.display.destroy();
        secondParent.display.destroy();
    });

    it('keeps child APIs on container objects only', () => {
        const group = new Group();
        const graphics = new Graphics();
        const image = new Image();
        const label = new Label();
        const nineSliceImage = new NineSliceImage();

        expect(group.children).toEqual([]);
        expect('children' in graphics).toBe(false);
        expect('children' in image).toBe(false);
        expect('children' in label).toBe(false);
        expect('children' in nineSliceImage).toBe(false);
        expect('addChild' in graphics).toBe(false);
        expect('addChild' in image).toBe(false);
        expect('addChild' in label).toBe(false);
        expect('addChild' in nineSliceImage).toBe(false);

        group.display.destroy();
        graphics.display.destroy();
        image.display.destroy();
        label.display.destroy();
        nineSliceImage.display.destroy();
    });
});

describe('Component lifecycle', () => {
    it('runs awake immediately, start once, update on each tick, and cleans up on removal', () => {
        const object = new TestObject();
        const component = object.addComponent(TestComponent);

        expect(component.awake).toHaveBeenCalledTimes(1);

        object.emitter.emit(GameObject.Event.TICKER_BEFORE, { deltaTime: 1 });
        object.emitter.emit(GameObject.Event.TICKER_BEFORE, { deltaTime: 2 });

        expect(component.start).toHaveBeenCalledTimes(1);
        expect(component.update).toHaveBeenCalledTimes(2);

        const removed = object.removeComponent(component);

        expect(removed).toBe(component);
        expect(component.onDestroy).toHaveBeenCalledTimes(1);

        object.emitter.emit(GameObject.Event.TICKER_BEFORE, { deltaTime: 3 });

        expect(component.start).toHaveBeenCalledTimes(1);
        expect(component.update).toHaveBeenCalledTimes(2);

        object.display.destroy();
    });

    it('passes ticker deltaTime to instantiated components', () => {
        const object = GameObject.instantiate(TestObject);
        const component = object.addComponent(TestComponent);

        Ticker.shared.update(performance.now() + 16);

        expect(component.update).toHaveBeenCalledWith(expect.any(Number));
        expect(typeof component.update.mock.calls[0][0]).toBe('number');

        GameObject.destroy(object);
    });
});

describe('onlyOnceQueueMicrotask', () => {
    it('coalesces calls in the same microtask into one invocation', async () => {
        const fn = vi.fn();
        const queued = onlyOnceQueueMicrotask((value: string) => fn(value));

        queued('first');
        queued('second');

        expect(fn).not.toHaveBeenCalled();

        await Promise.resolve();

        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith('first');

        queued('third');
        await Promise.resolve();

        expect(fn).toHaveBeenCalledTimes(2);
        expect(fn).toHaveBeenLastCalledWith('third');
    });
});
