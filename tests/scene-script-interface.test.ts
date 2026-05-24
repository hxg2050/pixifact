import { describe, expect, it } from 'vitest';
import {
    emitSceneScriptInterfaceDescriptor,
    event,
    extractSceneScriptInterface,
    part,
    prop,
    scene,
    slot,
} from 'pixifact/compiler';

describe('scene script interface extractor', () => {
    it('extracts scene public contract from narrow TypeScript decorators', () => {
        const contract = extractSceneScriptInterface(`
            import { Container, Text } from 'pixi.js';
            import { event, part, prop, scene, slot } from 'pixifact/compiler';

            @scene()
            export class Button extends Container {
                @prop({ type: 'string', default: 'Button' })
                accessor label = 'Button';

                @prop({ type: 'boolean', default: false })
                accessor disabled = false;

                @event()
                readonly click = createEvent();

                @part()
                protected declare labelText: Text;

                @part({ id: 'iconHost' })
                protected declare iconContainer: Container;

                @slot()
                icon!: Container;
            }
        `, 'Button.ts', { scene: 'scenes/Button.scene' });

        expect(contract).toEqual({
            scene: 'scenes/Button.scene',
            className: 'Button',
            interface: {
                props: {
                    label: {
                        type: 'string',
                        default: 'Button',
                    },
                    disabled: {
                        type: 'boolean',
                        default: false,
                    },
                },
                events: {
                    click: {
                        type: 'action',
                    },
                },
                slots: {
                    icon: {},
                },
            },
            parts: {
                labelText: 'labelText',
                iconContainer: 'iconHost',
            },
        });
    });

    it('supports explicit event and slot names', () => {
        const contract = extractSceneScriptInterface(`
            @scene()
            export class Panel {
                @event({ name: 'close' })
                readonly closeEvent = createEvent();

                @slot({ name: 'footer' })
                footerSlot!: unknown;
            }
        `, 'Panel.ts', { scene: 'scenes/Panel.scene' });

        expect(contract.interface.events).toEqual({
            close: {
                type: 'action',
            },
        });
        expect(contract.interface.slots).toEqual({
            footer: {},
        });
    });

    it('emits a stable JSON descriptor for editor and AI consumption', () => {
        const descriptor = emitSceneScriptInterfaceDescriptor(`
            @scene()
            export class Button {
                @prop({ type: 'string', default: 'Button' })
                accessor label = 'Button';

                @event()
                readonly click = createEvent();

                @slot()
                icon!: unknown;
            }
        `, 'Button.ts', { scene: 'scenes/Button.scene' });

        expect(JSON.parse(descriptor)).toEqual({
            scene: 'scenes/Button.scene',
            className: 'Button',
            interface: {
                props: {
                    label: {
                        type: 'string',
                        default: 'Button',
                    },
                },
                events: {
                    click: {
                        type: 'action',
                    },
                },
                slots: {
                    icon: {},
                },
            },
            parts: {},
        });
        expect(descriptor.endsWith('\n')).toBe(true);
    });

    it('exports no-op decorator factories for real scene scripts', () => {
        expect(typeof scene()).toBe('function');
        expect(typeof part()).toBe('function');
        expect(typeof part({ id: 'labelText' })).toBe('function');
        expect(typeof prop({ type: 'string', default: 'Button' })).toBe('function');
        expect(typeof event()).toBe('function');
        expect(typeof slot()).toBe('function');
    });

    it('rejects non-literal decorator options', () => {
        expect(() => extractSceneScriptInterface(`
            const defaults = { type: 'string' };

            @scene()
            export class Button {
                @prop(defaults)
                accessor label = 'Button';
            }
        `, 'Button.ts', { scene: 'scenes/Button.scene' })).toThrow('@prop argument must be an object literal.');
    });

    it('rejects @scene arguments because the .scene file owns script binding', () => {
        expect(() => extractSceneScriptInterface(`
            @scene('scenes/Button.scene')
            export class Button {}
        `, 'Button.ts', { scene: 'scenes/Button.scene' })).toThrow('@scene does not accept arguments.');
    });
});
