import { Container, Ticker } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Application, GameObject, Group, Input, Layout, ScrollRect, Textarea } from 'pixifact';

function setElementRect(element: Element, left: number, top: number) {
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
        x: left,
        y: top,
        left,
        top,
        right: left,
        bottom: top,
        width: 0,
        height: 0,
        toJSON: () => ({}),
    });
}

afterEach(() => {
    vi.restoreAllMocks();
});

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

describe('Input', () => {
    it('syncs value between the DOM element and the visible label', () => {
        const input = GameObject.instantiate(Input, undefined, {
            width: 120,
            height: 32,
        });

        input.value = 'hello';

        expect(input.element).toBeInstanceOf(HTMLInputElement);
        expect(input.element.value).toBe('hello');
        expect(input.valueLabel.value).toBe('hello');

        input.focus();
        expect(input.element.style.display).toBe('block');
        input.element.onfocus?.(new FocusEvent('focus'));
        expect(input.valueLabel.visible).toBe(false);

        input.element.value = 'pixifact';
        input.element.oninput?.(new Event('input'));
        input.blur();

        expect(input.value).toBe('pixifact');
        expect(input.valueLabel.value).toBe('pixifact');
        expect(input.element.style.display).toBe('none');
        expect(input.valueLabel.visible).toBe(true);

        GameObject.destroy(input);
    });

    it('updates element sizing from padding and removes the element on destroy', () => {
        const input = GameObject.instantiate(Input, undefined, {
            width: 100,
            height: 40,
            paddingLeft: 8,
            paddingRight: 10,
            paddingTop: 4,
            paddingBottom: 6,
        });

        input.update();

        expect(input.paddingRight).toBe(10);
        expect(input.element.style.boxSizing).toBe('border-box');
        expect(input.element.style.position).toBe('fixed');
        expect(input.element.style.left).toBe('0px');
        expect(input.element.style.top).toBe('0px');
        expect(input.element.style.zIndex).toBe('10');
        expect(input.element.style.background).toBe('transparent');
        expect(input.element.style.caretColor).toBe('#23272a');
        expect(input.element.style.width).toBe('100px');
        expect(input.element.style.height).toBe('40px');
        expect(input.element.style.padding).toBe('4px 10px 6px 8px');
        expect(document.body.contains(input.element)).toBe(true);

        GameObject.destroy(input);

        expect(document.body.contains(input.element)).toBe(false);
    });

    it('focuses the DOM element synchronously when activated', () => {
        const input = GameObject.instantiate(Input, undefined, {
            width: 120,
            height: 32,
        });
        const focus = vi.spyOn(input.element, 'focus');
        const pointerEvent = {
            pointerType: 'mouse',
            preventDefault: vi.fn(),
            stopPropagation: vi.fn(),
        };

        input.focus(pointerEvent as never);

        expect(input.element.style.display).toBe('block');
        expect(focus).toHaveBeenCalledTimes(1);
        expect(pointerEvent.preventDefault).toHaveBeenCalledTimes(1);
        expect(pointerEvent.stopPropagation).toHaveBeenCalledTimes(1);

        GameObject.destroy(input);
    });

    it('focuses when the visible text area is clicked', () => {
        const input = GameObject.instantiate(Input, undefined, {
            width: 120,
            height: 32,
        });
        const focus = vi.spyOn(input.element, 'focus');
        const pointerEvent = {
            pointerType: 'mouse',
            preventDefault: vi.fn(),
            stopPropagation: vi.fn(),
        };

        input.value = 'pixifact';
        input.display.emit('pointerdown', pointerEvent);

        expect(input.display.eventMode).toBe('static');
        expect(input.display.interactiveChildren).toBe(false);
        expect(input.display.cursor).toBe('text');
        expect(input.element.style.display).toBe('block');
        expect(focus).toHaveBeenCalledTimes(1);

        GameObject.destroy(input);
    });

    it('does not prevent default touch activation', () => {
        const input = GameObject.instantiate(Input, undefined, {
            width: 120,
            height: 32,
        });
        const pointerEvent = {
            pointerType: 'touch',
            preventDefault: vi.fn(),
            stopPropagation: vi.fn(),
        };

        input.focus(pointerEvent as never);

        expect(pointerEvent.preventDefault).not.toHaveBeenCalled();
        expect(pointerEvent.stopPropagation).toHaveBeenCalledTimes(1);

        GameObject.destroy(input);
    });

    it('aligns the DOM element to the canvas offset', () => {
        const canvas = document.createElement('canvas');
        setElementRect(canvas, 30, 40);
        document.body.append(canvas);

        const input = GameObject.instantiate(Input, undefined, {
            x: 12,
            y: 16,
            width: 80,
            height: 24,
            canvas,
        });

        input.update();

        expect(input.element.style.transform).toBe('matrix(1, 0, 0, 1, 42, 56)');

        GameObject.destroy(input);
        canvas.remove();
    });

    it('updates the DOM transform after viewport changes and removes listeners on destroy', () => {
        const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
        const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
        const canvas = document.createElement('canvas');
        setElementRect(canvas, 10, 20);
        document.body.append(canvas);

        const input = GameObject.instantiate(Input, undefined, {
            x: 5,
            y: 6,
            width: 80,
            height: 24,
            canvas,
        });
        input.update();
        expect(input.element.style.transform).toBe('matrix(1, 0, 0, 1, 15, 26)');

        vi.mocked(canvas.getBoundingClientRect).mockReturnValue({
            x: 40,
            y: 50,
            left: 40,
            top: 50,
            right: 40,
            bottom: 50,
            width: 0,
            height: 0,
            toJSON: () => ({}),
        });
        window.dispatchEvent(new Event('resize'));
        input.update();

        expect(input.element.style.transform).toBe('matrix(1, 0, 0, 1, 45, 56)');
        expect(addEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
        expect(addEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function), true);

        GameObject.destroy(input);

        expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
        expect(removeEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function), true);
        expect(input.element.onfocus).toBeNull();
        expect(input.element.onblur).toBeNull();
        expect(input.element.oninput).toBeNull();
        vi.mocked(canvas.getBoundingClientRect).mockReturnValue({
            x: 80,
            y: 90,
            left: 80,
            top: 90,
            right: 80,
            bottom: 90,
            width: 0,
            height: 0,
            toJSON: () => ({}),
        });
        window.dispatchEvent(new Event('resize'));
        input.update();
        expect(input.element.style.transform).toBe('matrix(1, 0, 0, 1, 45, 56)');

        canvas.remove();
    });

    it('uses the current global transform when updated by the application ticker', () => {
        const app = createTestApplication();
        const canvas = document.createElement('canvas');
        setElementRect(canvas, 30, 40);
        document.body.append(canvas);

        const parent = GameObject.instantiate(Group, app.root, {
            x: 100,
            y: 50,
        });
        const input = GameObject.instantiate(Input, parent, {
            x: 12,
            y: 16,
            width: 80,
            height: 24,
            canvas,
        });

        app.ticker.update(performance.now() + 16);

        expect(input.element.style.transform).toBe('matrix(1, 0, 0, 1, 142, 106)');

        input.focus();

        parent.x = 120;
        parent.y = 70;
        app.ticker.update(performance.now() + 32);

        expect(input.element.style.transform).toBe('matrix(1, 0, 0, 1, 162, 126)');

        GameObject.destroy(app.root);
        app.ticker.destroy();
        canvas.remove();
    });

    it('updates the DOM transform when Layout repositions it', () => {
        const app = createTestApplication();
        const canvas = document.createElement('canvas');
        setElementRect(canvas, 30, 40);
        document.body.append(canvas);

        const parent = GameObject.instantiate(Group, app.root, {
            width: 400,
            height: 200,
        });
        const input = GameObject.instantiate(Input, parent, {
            width: 80,
            height: 24,
            canvas,
        });

        app.ticker.update(performance.now() + 16);
        expect(input.element.style.transform).toBe('matrix(1, 0, 0, 1, 30, 40)');

        input.addComponent(Layout, { centerX: 0, centerY: 0 });
        app.ticker.update(performance.now() + 32);

        expect(input.x).toBe(160);
        expect(input.y).toBe(88);
        expect(input.element.style.transform).toBe('matrix(1, 0, 0, 1, 190, 128)');

        GameObject.destroy(app.root);
        app.ticker.destroy();
        canvas.remove();
    });

    it('updates the DOM transform when its transform changes outside position setters', () => {
        const app = createTestApplication();
        const canvas = document.createElement('canvas');
        setElementRect(canvas, 30, 40);
        document.body.append(canvas);

        const input = GameObject.instantiate(Input, app.root, {
            x: 12,
            y: 16,
            width: 80,
            height: 24,
            canvas,
        });

        app.ticker.update(performance.now() + 16);
        expect(input.element.style.transform).toBe('matrix(1, 0, 0, 1, 42, 56)');

        input.transform.scaleX = 2;
        app.ticker.update(performance.now() + 32);

        expect(input.element.style.transform).toBe('matrix(2, 0, 0, 1, 42, 56)');

        GameObject.destroy(app.root);
        app.ticker.destroy();
        canvas.remove();
    });
});

describe('Textarea', () => {
    it('creates a textarea element and wraps the visible label within content width', () => {
        const textarea = GameObject.instantiate(Textarea, undefined, {
            width: 160,
            height: 80,
            paddingLeft: 12,
            paddingRight: 14,
        });

        textarea.update();

        expect(textarea.element).toBeInstanceOf(HTMLTextAreaElement);
        expect(textarea.element.style.resize).toBe('none');
        expect(textarea.valueLabel.style.wordWrap).toBe(true);
        expect(textarea.valueLabel.style.breakWords).toBe(true);
        expect(textarea.valueLabel.style.wordWrapWidth).toBe(134);

        GameObject.destroy(textarea);
    });

    it('focuses when clicked after its custom resize refreshes the hit area', () => {
        const textarea = GameObject.instantiate(Textarea, undefined, {
            width: 160,
            height: 80,
        });
        const focus = vi.spyOn(textarea.element, 'focus');

        textarea.update();
        textarea.display.emit('pointerdown', {
            pointerType: 'mouse',
            preventDefault: vi.fn(),
            stopPropagation: vi.fn(),
        });

        expect(textarea.display.hitArea).toBeDefined();
        expect(textarea.element.style.display).toBe('block');
        expect(focus).toHaveBeenCalledTimes(1);

        GameObject.destroy(textarea);
    });

    it('preserves explicit DOM line height when sizing is refreshed', () => {
        const textarea = GameObject.instantiate(Textarea, undefined, {
            width: 160,
            height: 80,
            lineHeight: 18,
        });

        textarea.update();

        expect(textarea.lineHeight).toBe(18);
        expect(textarea.element.style.lineHeight).toBe('18px');

        textarea.height = 100;
        textarea.update();

        expect(textarea.lineHeight).toBe(18);
        expect(textarea.element.style.lineHeight).toBe('18px');

        GameObject.destroy(textarea);
    });
});

describe('ScrollRect', () => {
    it('clamps scrollY and moves content in the opposite direction', () => {
        const viewport = GameObject.instantiate(Group, undefined, {
            width: 200,
            height: 100,
        });
        const content = GameObject.instantiate(Group, viewport, { width: 200, height: 260 });
        const scroll = viewport.addComponent(ScrollRect, {
            viewport,
            content,
            contentHeight: 260,
        });

        scroll.scrollTo(80);
        expect(content.y).toBe(-80);

        scroll.scrollBy(300);
        expect(content.y).toBe(-160);

        scroll.scrollTo(-40);
        expect(Object.is(content.y, -0) ? 0 : content.y).toBe(0);

        GameObject.destroy(viewport);
    });

    it('uses the game object as the viewport when no viewport ref is set', () => {
        const viewport = GameObject.instantiate(Group, undefined, {
            width: 200,
            height: 100,
        });
        const content = GameObject.instantiate(Group, viewport, { width: 200, height: 180 });
        const scroll = viewport.addComponent(ScrollRect, {
            content,
            contentHeight: 180,
        });

        expect(scroll.maxScrollY).toBe(80);

        scroll.scrollTo(80);
        expect(content.y).toBe(-80);

        GameObject.destroy(viewport);
    });

    it('removes Pixi event listeners on destroy', () => {
        const viewport = GameObject.instantiate(Group, undefined, {
            width: 200,
            height: 100,
        });
        const content = GameObject.instantiate(Group, viewport, { width: 200, height: 260 });
        viewport.addComponent(ScrollRect, {
            viewport,
            content,
            contentHeight: 260,
        });

        expect(viewport.display.listenerCount('wheel')).toBe(1);
        expect(viewport.display.listenerCount('pointerdown')).toBe(1);
        expect(viewport.display.listenerCount('globalpointermove')).toBe(1);

        GameObject.destroy(viewport);

        expect(viewport.display.listenerCount('wheel')).toBe(0);
        expect(viewport.display.listenerCount('pointerdown')).toBe(0);
        expect(viewport.display.listenerCount('globalpointermove')).toBe(0);
    });
});
