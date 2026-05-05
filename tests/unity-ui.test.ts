import { Container } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import {
    ButtonComponent,
    ComponentRegistry,
    GameObject,
    Group,
    RoundedRectGraphic,
    TextGraphic,
    button,
    group,
    instantiate,
    prefab,
    ref,
    roundedRect,
    textGraphic,
} from '../src';

describe('Unity-like UI component metadata', () => {
    it('registers decorated components with prop schemas', () => {
        const buttonSchema = ComponentRegistry.get('ui.Button');
        const rectSchema = ComponentRegistry.get('ui.RoundedRectGraphic');

        expect(buttonSchema?.displayName).toBe('Button');
        expect(buttonSchema?.props.some((prop) => prop.key === 'onClick' && prop.type === 'event')).toBe(true);
        expect(buttonSchema?.props.some((prop) => prop.key === 'targetGraphic' && prop.type === 'componentRef')).toBe(true);
        expect(rectSchema?.props.some((prop) => prop.key === 'color' && prop.type === 'color')).toBe(true);
    });
});

describe('Unity-like Button vertical slice', () => {
    it('composes a button from Group and components using runtime API', () => {
        const node = GameObject.instantiate(Group, undefined, {
            width: 120,
            height: 40,
        });
        const graphic = node.addComponent(RoundedRectGraphic, {
            color: 0x2563eb,
            radius: 8,
        });
        const click = vi.fn();
        const buttonComponent = node.addComponent(ButtonComponent, {
            targetGraphic: graphic,
            onClick: click,
        });
        const event = {} as never;

        node.display.emit('pointerover', event);
        expect(graphic.color).toBe(buttonComponent.highlightedColor);

        node.display.emit('pointerdown', event);
        expect(graphic.color).toBe(buttonComponent.pressedColor);

        node.display.emit('pointerup', event);
        node.display.emit('pointertap', event);
        expect(click).toHaveBeenCalledWith(event);

        GameObject.destroy(node);
    });

    it('instantiates a button prefab from TS DSL and resolves refs/actions', () => {
        const click = vi.fn();
        const spec = prefab('PrimaryButton',
            group('Button', {
                key: 'submitButton',
                width: 140,
                height: 44,
                components: [
                    roundedRect({ color: 0x2563eb, radius: 8 }, 'bg'),
                    button({ targetGraphic: ref('bg'), onClick: 'submitLogin' }, 'button'),
                ],
                children: [
                    group('Label', {
                        key: 'submitButtonLabel',
                        width: 140,
                        height: 44,
                        components: [
                            textGraphic({
                                text: 'Submit',
                                color: 0xffffff,
                                fontSize: 14,
                                center: true,
                            }, 'text'),
                        ],
                    }),
                ],
            }),
        );

        const result = instantiate(spec, undefined, {
            actions: {
                submitLogin: click as (...args: unknown[]) => void,
            },
        });
        const root = result.root;
        const graphic = result.components.get('bg') as RoundedRectGraphic;
        const text = result.components.get('text') as TextGraphic;

        expect(root).toBeInstanceOf(Group);
        expect(root.width).toBe(140);
        expect(root.height).toBe(44);
        expect(graphic.color).toBe(0x2563eb);
        expect(text.text).toBe('Submit');
        expect(text.display).toBeInstanceOf(Container);

        root.display.emit('pointertap', {} as never);
        expect(click).toHaveBeenCalledTimes(1);

        GameObject.destroy(root);
    });
});
