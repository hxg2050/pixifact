import { describe, expect, it } from 'vitest';
import { GameObject, Input, Textarea } from '../src';

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

        input.element.value = 'pixif';
        input.element.oninput?.(new Event('input'));
        input.blur();

        expect(input.value).toBe('pixif');
        expect(input.valueLabel.value).toBe('pixif');
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
        expect(input.paddinRight).toBe(10);
        expect(input.element.style.width).toBe('100px');
        expect(input.element.style.height).toBe('40px');
        expect(input.element.style.padding).toBe('4px 10px 6px 8px');
        expect(document.body.contains(input.element)).toBe(true);

        GameObject.destroy(input);

        expect(document.body.contains(input.element)).toBe(false);
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
});
