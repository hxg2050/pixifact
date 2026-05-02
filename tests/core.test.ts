import { Container, Ticker } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { Application, Component, Flex, FlexDirection, FlexGroup, GameObject, Graphics, GridLayout, Group, Image, Label, Layout, NineSliceImage } from '../src/core';
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

class StartComponent extends Component<TestObject> {
    start = vi.fn();
}

class RemoveOnStartComponent extends Component<TestObject> {
    start = vi.fn(() => {
        this.gameObject.removeComponent(this);
    });
    update = vi.fn();
    onDestroy = vi.fn();
}

class UpdateObject extends TestObject {
    update = vi.fn();
}

class CompositeObject extends Group {
    title = '';
    titleLabel?: Label;

    render() {
        this.titleLabel = GameObject.instantiate(Label, this, {
            value: this.title,
        });
    }
}

function createTestApplication() {
    const app = new Application();
    const root = new Group();
    const ticker = new Ticker();

    Object.assign(app, {
        root,
        stage: root.display,
        ticker,
    });
    root.display = new Container();
    app.stage = root.display;
    root.setApplication(app);

    return app;
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
        const reposition = vi.fn();
        object.emitter.on(GameObject.Event.REPOSITION, reposition);

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
        expect(reposition).toHaveBeenCalledTimes(2);

        object.display.destroy();
    });

    it('syncs position when the same Vector2 instance is mutated and assigned back', () => {
        const object = new TestObject();
        const reposition = vi.fn();
        const position = object.transform.position;
        object.emitter.on(GameObject.Event.REPOSITION, reposition);

        position.x = 40;
        position.y = 50;
        object.transform.position = position;

        expect(object.display.x).toBe(40);
        expect(object.display.y).toBe(50);
        expect(reposition).toHaveBeenCalledTimes(1);

        object.display.destroy();
    });

    it('keeps internal position in sync when display position was changed directly', () => {
        const object = new TestObject();
        object.display.position.set(70, 80);

        object.transform.position = object.display.position;

        expect(object.x).toBe(70);
        expect(object.y).toBe(80);

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
    it('applies props before render for composite group objects', () => {
        const stage = new Group();
        const composite = GameObject.instantiate(CompositeObject, stage, {
            width: 240,
            height: 120,
            title: 'Ready before render',
        });

        expect(composite.width).toBe(240);
        expect(composite.height).toBe(120);
        expect(composite.titleLabel?.value).toBe('Ready before render');
        expect(composite.children).toEqual([composite.titleLabel]);

        GameObject.destroy(stage);
    });

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

describe('Layout components', () => {
    it('applies layout props before awake so centered children render immediately', async () => {
        const stage = new Group();
        stage.width = 800;
        stage.height = 600;

        const panel = GameObject.instantiate(Group, stage, {
            width: 720,
            height: 460,
            anchorX: 0.5,
            anchorY: 0.5,
        });

        panel.addComponent(Layout, { centerX: 0, centerY: 0 });

        expect(panel.x).toBe(400);
        expect(panel.y).toBe(300);
        expect(panel.display.x).toBe(400);
        expect(panel.display.y).toBe(300);

        stage.width = 1000;
        stage.height = 700;
        await Promise.resolve();

        expect(panel.x).toBe(500);
        expect(panel.y).toBe(350);

        GameObject.destroy(stage);
    });

    it('keeps deprecated vertical and horizontal aliases compatible', () => {
        const stage = new Group();
        stage.width = 400;
        stage.height = 300;

        const panel = GameObject.instantiate(Group, stage, {
            width: 100,
            height: 60,
            anchorX: 0.5,
            anchorY: 0.5,
        });

        const layout = panel.addComponent(Layout, { vertical: 10, horizontal: -20 });

        expect(layout.centerX).toBe(10);
        expect(layout.centerY).toBe(-20);
        expect(panel.x).toBe(210);
        expect(panel.y).toBe(130);

        GameObject.destroy(stage);
    });

    it('recomputes when center constraints are cleared', async () => {
        const stage = new Group();
        stage.width = 400;
        stage.height = 300;

        const panel = GameObject.instantiate(Group, stage, {
            width: 100,
            height: 60,
            anchorX: 0.5,
            anchorY: 0.5,
        });
        const layout = panel.addComponent(Layout, {
            left: 20,
            top: 30,
            centerX: 0,
            centerY: 0,
        });

        expect(panel.x).toBe(200);
        expect(panel.y).toBe(150);

        layout.centerX = undefined;
        layout.centerY = undefined;
        await Promise.resolve();

        expect(panel.x).toBe(70);
        expect(panel.y).toBe(60);

        GameObject.destroy(stage);
    });

    it('stretches within parent bounds and clamps negative sizes to minimums', async () => {
        const stage = new Group();
        stage.width = 300;
        stage.height = 200;

        const panel = GameObject.instantiate(Group, stage, {
            width: 100,
            height: 80,
        });
        const layout = panel.addComponent(Layout, {
            left: 20,
            right: 30,
            top: 10,
            bottom: 20,
            minWidth: 50,
            minHeight: 40,
        });

        expect(panel.width).toBe(250);
        expect(panel.height).toBe(170);
        expect(panel.x).toBe(20);
        expect(panel.y).toBe(10);

        stage.width = 60;
        stage.height = 40;
        await Promise.resolve();

        expect(panel.width).toBe(50);
        expect(panel.height).toBe(40);
        expect(panel.x).toBe(20);
        expect(panel.y).toBe(10);

        layout.left = undefined;
        layout.top = undefined;
        await Promise.resolve();

        expect(panel.width).toBe(100);
        expect(panel.height).toBe(80);
        expect(panel.x).toBe(-70);
        expect(panel.y).toBe(-60);

        GameObject.destroy(stage);
    });

    it('updates preferred size after manual size changes', async () => {
        const stage = new Group();
        stage.width = 500;
        stage.height = 400;

        const panel = GameObject.instantiate(Group, stage, {
            width: 100,
            height: 80,
        });
        panel.addComponent(Layout, { right: 20, bottom: 30 });

        expect(panel.x).toBe(380);
        expect(panel.y).toBe(290);

        panel.width = 140;
        panel.height = 120;
        await Promise.resolve();

        expect(panel.x).toBe(340);
        expect(panel.y).toBe(250);

        stage.width = 600;
        stage.height = 500;
        await Promise.resolve();

        expect(panel.x).toBe(440);
        expect(panel.y).toBe(350);

        GameObject.destroy(stage);
    });

    it('rebinds parent resize listeners when reparented', async () => {
        const firstParent = new Group();
        firstParent.width = 400;
        firstParent.height = 300;
        const secondParent = new Group();
        secondParent.width = 800;
        secondParent.height = 600;

        const panel = GameObject.instantiate(Group, firstParent, {
            width: 100,
            height: 80,
            anchorX: 0.5,
            anchorY: 0.5,
        });
        panel.addComponent(Layout, { centerX: 0, centerY: 0 });

        expect(panel.x).toBe(200);
        expect(panel.y).toBe(150);

        secondParent.addChild(panel);
        await Promise.resolve();

        expect(firstParent.emitter.listenerCount(GameObject.Event.RESIZE)).toBe(0);
        expect(secondParent.emitter.listenerCount(GameObject.Event.RESIZE)).toBe(1);
        expect(panel.x).toBe(400);
        expect(panel.y).toBe(300);

        secondParent.width = 1000;
        secondParent.height = 700;
        await Promise.resolve();

        expect(panel.x).toBe(500);
        expect(panel.y).toBe(350);

        GameObject.destroy(firstParent);
        GameObject.destroy(secondParent);
    });

    it('coalesces layout position updates into one reposition event', () => {
        const stage = new Group();
        stage.width = 800;
        stage.height = 600;
        const panel = GameObject.instantiate(Group, stage, {
            width: 200,
            height: 100,
            anchorX: 0.5,
            anchorY: 0.5,
        });
        const reposition = vi.fn();
        panel.emitter.on(GameObject.Event.REPOSITION, reposition);

        panel.addComponent(Layout, { centerX: 0, centerY: 0 });

        expect(panel.x).toBe(400);
        expect(panel.y).toBe(300);
        expect(reposition).toHaveBeenCalledTimes(1);

        GameObject.destroy(stage);
    });

    it('does not register ticker just to refresh layout', () => {
        const baseTickerCount = Ticker.shared.count;
        const stage = new Group();
        const panel = GameObject.instantiate(Group, stage, {
            width: 100,
            height: 80,
        });

        panel.addComponent(Layout, { left: 0, top: 0 });

        expect(Ticker.shared.count).toBe(baseTickerCount);

        GameObject.destroy(stage);
    });

    it('removes layout listeners when components are removed', () => {
        const parent = new Group();
        const child = GameObject.instantiate(Group, parent, {
            width: 100,
            height: 80,
        });
        const layout = child.addComponent(Layout, { left: 10, top: 20 });

        expect(parent.emitter.listenerCount(GameObject.Event.RESIZE)).toBe(1);
        expect(child.emitter.listenerCount(GameObject.Event.RESIZE)).toBe(1);
        expect(child.emitter.listenerCount(GameObject.Event.ADDED)).toBe(1);
        expect(child.emitter.listenerCount(GameObject.Event.REMOVED)).toBe(1);

        child.removeComponent(layout);

        expect(parent.emitter.listenerCount(GameObject.Event.RESIZE)).toBe(0);
        expect(child.emitter.listenerCount(GameObject.Event.RESIZE)).toBe(0);
        expect(child.emitter.listenerCount(GameObject.Event.ADDED)).toBe(0);
        expect(child.emitter.listenerCount(GameObject.Event.REMOVED)).toBe(0);

        GameObject.destroy(parent);
    });

    it('removes grid layout listeners when components are removed', () => {
        const grid = new Group();
        const layout = grid.addComponent(GridLayout);

        expect(grid.emitter.listenerCount(GameObject.Event.CHILD_ADDED)).toBe(1);
        expect(grid.emitter.listenerCount(GameObject.Event.CHILD_REMOVED)).toBe(1);

        grid.removeComponent(layout);

        expect(grid.emitter.listenerCount(GameObject.Event.CHILD_ADDED)).toBe(0);
        expect(grid.emitter.listenerCount(GameObject.Event.CHILD_REMOVED)).toBe(0);

        grid.display.destroy();
    });

    it('lays out grid children by column count with explicit gap directions', async () => {
        const grid = new Group();
        const layout = grid.addComponent(GridLayout, {
            col: 2,
            gridWidth: 20,
            gridHeight: 10,
            gapHorizontal: 5,
            gapVertical: 7,
        });
        const first = GameObject.instantiate(Group, grid);
        const second = GameObject.instantiate(Group, grid);
        const third = GameObject.instantiate(Group, grid);

        await Promise.resolve();

        expect(first.x).toBe(0);
        expect(first.y).toBe(0);
        expect(second.x).toBe(25);
        expect(second.y).toBe(0);
        expect(third.x).toBe(0);
        expect(third.y).toBe(17);
        expect(first.width).toBe(20);
        expect(first.height).toBe(10);

        layout.gapHorizontal = 10;
        layout.gapVertical = 12;
        await Promise.resolve();

        expect(second.x).toBe(30);
        expect(third.y).toBe(22);

        grid.display.destroy();
    });

    it('keeps deprecated row as an alias for column count', async () => {
        const grid = new Group();
        const layout = grid.addComponent(GridLayout, {
            row: 3,
            gridWidth: 10,
            gridHeight: 10,
        });
        const first = GameObject.instantiate(Group, grid);
        const second = GameObject.instantiate(Group, grid);
        const third = GameObject.instantiate(Group, grid);
        const fourth = GameObject.instantiate(Group, grid);

        await Promise.resolve();

        expect(layout.col).toBe(3);
        expect(first.x).toBe(0);
        expect(second.x).toBe(10);
        expect(third.x).toBe(20);
        expect(fourth.x).toBe(0);
        expect(fourth.y).toBe(10);

        grid.display.destroy();
    });

    it('normalizes invalid grid column counts', async () => {
        const grid = new Group();
        const layout = grid.addComponent(GridLayout, {
            col: 0,
            gridWidth: 10,
            gridHeight: 10,
        });
        const first = GameObject.instantiate(Group, grid);
        const second = GameObject.instantiate(Group, grid);

        await Promise.resolve();

        expect(layout.col).toBe(1);
        expect(first.x).toBe(0);
        expect(first.y).toBe(0);
        expect(second.x).toBe(0);
        expect(second.y).toBe(10);

        layout.col = 2.8;
        await Promise.resolve();

        expect(layout.col).toBe(2);
        expect(second.x).toBe(10);
        expect(second.y).toBe(0);

        grid.display.destroy();
    });

    it('refreshes grid layout after removing children without ticker work', async () => {
        const baseTickerCount = Ticker.shared.count;
        const grid = new Group();
        grid.addComponent(GridLayout, {
            col: 2,
            gridWidth: 10,
            gridHeight: 10,
        });
        const first = GameObject.instantiate(Group, grid);
        const second = GameObject.instantiate(Group, grid);
        const third = GameObject.instantiate(Group, grid);

        await Promise.resolve();
        expect(Ticker.shared.count).toBe(baseTickerCount);
        expect(third.x).toBe(0);
        expect(third.y).toBe(10);

        grid.removeChild(first);
        await Promise.resolve();

        expect(second.x).toBe(0);
        expect(second.y).toBe(0);
        expect(third.x).toBe(10);
        expect(third.y).toBe(0);
        expect(Ticker.shared.count).toBe(baseTickerCount);

        first.display.destroy();
        grid.display.destroy();
    });
});

describe('Flex layout components', () => {
    it('distributes row space by grow values with gaps between children only', async () => {
        const group = new Group();
        group.width = 300;
        group.height = 80;
        group.addComponent(FlexGroup, { gap: 10 });
        const fixed = GameObject.instantiate(Group, group, {
            width: 50,
            height: 20,
        });
        const firstFlex = GameObject.instantiate(Group, group, {
            height: 20,
        });
        firstFlex.addComponent(Flex, { grow: 1 });
        const secondFlex = GameObject.instantiate(Group, group, {
            height: 20,
        });
        secondFlex.addComponent(Flex, { grow: 2 });

        await Promise.resolve();

        expect(fixed.x).toBe(0);
        expect(fixed.width).toBe(50);
        expect(firstFlex.x).toBe(60);
        expect(firstFlex.width).toBeCloseTo(76.6666666667);
        expect(secondFlex.x).toBeCloseTo(146.6666666667);
        expect(secondFlex.width).toBeCloseTo(153.3333333333);

        group.display.destroy();
    });

    it('distributes column space and refreshes when direction or gap changes', async () => {
        const group = new Group();
        group.width = 300;
        group.height = 200;
        const layout = group.addComponent(FlexGroup, {
            direction: FlexDirection.COLUMN,
            gap: 10,
        });
        const first = GameObject.instantiate(Group, group, { width: 20 });
        first.addComponent(Flex, { grow: 1 });
        const second = GameObject.instantiate(Group, group, { width: 20 });
        second.addComponent(Flex, { grow: 1 });

        await Promise.resolve();

        expect(first.y).toBe(0);
        expect(first.height).toBe(95);
        expect(second.y).toBe(105);
        expect(second.height).toBe(95);

        layout.gap = 20;
        await Promise.resolve();

        expect(first.height).toBe(90);
        expect(second.y).toBe(110);

        layout.direction = FlexDirection.ROW;
        await Promise.resolve();

        expect(first.x).toBe(0);
        expect(first.width).toBe(140);
        expect(second.x).toBe(160);
        expect(second.width).toBe(140);

        group.display.destroy();
    });

    it('handles zero grow totals without dividing by zero', async () => {
        const group = new Group();
        group.width = 200;
        group.addComponent(FlexGroup, { gap: 10 });
        const first = GameObject.instantiate(Group, group, {
            width: 40,
            height: 20,
        });
        first.addComponent(Flex, { grow: 0 });
        const second = GameObject.instantiate(Group, group, {
            width: 50,
            height: 20,
        });

        await Promise.resolve();

        expect(first.width).toBe(40);
        expect(first.x).toBe(0);
        expect(second.width).toBe(50);
        expect(second.x).toBe(50);

        group.display.destroy();
    });

    it('refreshes after child remove, child resize, and flex grow changes', async () => {
        const group = new Group();
        group.width = 240;
        group.addComponent(FlexGroup, { gap: 10 });
        const first = GameObject.instantiate(Group, group, { width: 40 });
        const second = GameObject.instantiate(Group, group);
        const secondFlex = second.addComponent(Flex, { grow: 1 });
        const third = GameObject.instantiate(Group, group);
        third.addComponent(Flex, { grow: 1 });

        await Promise.resolve();

        expect(second.x).toBe(50);
        expect(second.width).toBe(90);
        expect(third.x).toBe(150);
        expect(third.width).toBe(90);

        group.removeChild(first);
        await Promise.resolve();

        expect(second.x).toBe(0);
        expect(second.width).toBe(115);
        expect(third.x).toBe(125);
        expect(third.width).toBe(115);

        secondFlex.grow = 3;
        await Promise.resolve();

        expect(second.width).toBeCloseTo(172.5);
        expect(third.x).toBeCloseTo(182.5);
        expect(third.width).toBeCloseTo(57.5);

        second.width = 100;
        await Promise.resolve();

        expect(second.width).toBeCloseTo(172.5);
        expect(third.x).toBeCloseTo(182.5);

        first.display.destroy();
        group.display.destroy();
    });

    it('removes flex group listeners when components are removed', () => {
        const group = new Group();
        const child = GameObject.instantiate(Group, group);
        const layout = group.addComponent(FlexGroup);

        expect(group.emitter.listenerCount(GameObject.Event.RESIZE)).toBe(1);
        expect(group.emitter.listenerCount(GameObject.Event.CHILD_ADDED)).toBe(1);
        expect(group.emitter.listenerCount(GameObject.Event.CHILD_REMOVED)).toBe(1);
        expect(child.emitter.listenerCount(GameObject.Event.RESIZE)).toBe(1);

        group.removeComponent(layout);

        expect(group.emitter.listenerCount(GameObject.Event.RESIZE)).toBe(0);
        expect(group.emitter.listenerCount(GameObject.Event.CHILD_ADDED)).toBe(0);
        expect(group.emitter.listenerCount(GameObject.Event.CHILD_REMOVED)).toBe(0);
        expect(child.emitter.listenerCount(GameObject.Event.RESIZE)).toBe(0);

        group.display.destroy();
    });
});

describe('Component lifecycle', () => {
    it('runs awake immediately, starts before the first update, and cleans up on removal', () => {
        const object = new TestObject();
        const component = object.addComponent(TestComponent);

        expect(component.awake).toHaveBeenCalledTimes(1);
        expect(component.start).not.toHaveBeenCalled();
        expect(component.update).not.toHaveBeenCalled();

        object.emitter.emit(GameObject.Event.TICKER_BEFORE, 1);
        expect(component.start).toHaveBeenCalledTimes(1);
        expect(component.update).toHaveBeenCalledTimes(1);

        object.emitter.emit(GameObject.Event.TICKER_BEFORE, 2);

        expect(component.start).toHaveBeenCalledTimes(1);
        expect(component.update).toHaveBeenCalledTimes(2);

        const removed = object.removeComponent(component);

        expect(removed).toBe(component);
        expect(component.onDestroy).toHaveBeenCalledTimes(1);

        object.emitter.emit(GameObject.Event.TICKER_BEFORE, 3);

        expect(component.start).toHaveBeenCalledTimes(1);
        expect(component.update).toHaveBeenCalledTimes(2);

        object.display.destroy();
    });

    it('does not run update if start removes the component', () => {
        const object = new TestObject();
        const component = object.addComponent(RemoveOnStartComponent);

        object.emitter.emit(GameObject.Event.TICKER_BEFORE, 1);

        expect(component.start).toHaveBeenCalledTimes(1);
        expect(component.update).not.toHaveBeenCalled();
        expect(component.onDestroy).toHaveBeenCalledTimes(1);
        expect(object.components).not.toContain(component);

        object.display.destroy();
    });

    it('passes app ticker deltaTime to mounted components', () => {
        const app = createTestApplication();
        const object = GameObject.instantiate(TestObject, app.root);
        const component = object.addComponent(TestComponent);

        app.ticker.update(performance.now() + 16);

        expect(component.update).toHaveBeenCalledWith(expect.any(Number));
        expect(typeof component.update.mock.calls[0][0]).toBe('number');
        expect(component.start).toHaveBeenCalledTimes(1);

        GameObject.destroy(app.root);
        app.ticker.destroy();
    });

    it('runs a start-only component before the next ticker and then unregisters', () => {
        const app = createTestApplication();
        const object = GameObject.instantiate(TestObject, app.root);
        const component = object.addComponent(StartComponent);

        expect(component.start).not.toHaveBeenCalled();
        expect(app.ticker.count).toBe(1);

        app.ticker.update(performance.now() + 16);

        expect(component.start).toHaveBeenCalledTimes(1);
        expect(app.ticker.count).toBe(0);

        GameObject.destroy(app.root);
        app.ticker.destroy();
    });

    it('registers the app ticker only while mounted objects or components need updates', () => {
        const app = createTestApplication();
        const idleObject = GameObject.instantiate(TestObject, app.root);

        expect(app.ticker.count).toBe(0);

        const updateObject = GameObject.instantiate(UpdateObject, app.root);

        expect(app.ticker.count).toBe(1);

        GameObject.destroy(updateObject);

        expect(app.ticker.count).toBe(0);

        const componentObject = GameObject.instantiate(TestObject, app.root);
        const component = componentObject.addComponent(TestComponent);

        expect(app.ticker.count).toBe(1);

        componentObject.removeComponent(component);

        expect(app.ticker.count).toBe(0);

        app.root.removeChild(idleObject);
        const detachedObject = GameObject.instantiate(UpdateObject);
        expect(app.ticker.count).toBe(0);
        app.root.addChild(detachedObject);
        expect(app.ticker.count).toBe(1);
        app.root.removeChild(detachedObject);
        expect(app.ticker.count).toBe(0);

        GameObject.destroy(componentObject);
        GameObject.destroy(idleObject);
        GameObject.destroy(detachedObject);
        GameObject.destroy(app.root);
        app.ticker.destroy();
    });

    it('releases app ticker and component listeners when destroyed', () => {
        const app = createTestApplication();
        const object = GameObject.instantiate(TestObject, app.root);
        const component = object.addComponent(TestComponent);

        expect(app.ticker.count).toBe(1);

        GameObject.destroy(object);

        expect(app.ticker.count).toBe(0);
        expect(component.onDestroy).toHaveBeenCalledTimes(1);

        app.ticker.update(performance.now() + 16);

        expect(component.update).not.toHaveBeenCalled();

        GameObject.destroy(app.root);
        app.ticker.destroy();
    });

    it('updates direct ticker listeners through the mounted app only', () => {
        const app = createTestApplication();
        const object = GameObject.instantiate(TestObject);
        const before = vi.fn();
        const after = vi.fn();

        object.emitter.on(GameObject.Event.TICKER_BEFORE, before);
        object.emitter.on(GameObject.Event.TICKER_AFTER, after);
        expect(app.ticker.count).toBe(0);

        app.root.addChild(object);
        expect(app.ticker.count).toBe(1);

        app.ticker.update(performance.now() + 16);
        expect(before).toHaveBeenCalledWith(expect.any(Number));
        expect(after).toHaveBeenCalledWith(expect.any(Number));

        object.emitter.off(GameObject.Event.TICKER_BEFORE, before);
        expect(app.ticker.count).toBe(1);
        object.emitter.off(GameObject.Event.TICKER_AFTER, after);
        expect(app.ticker.count).toBe(0);

        GameObject.destroy(app.root);
        app.ticker.destroy();
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
