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
                @prop({ type: String, default: 'Button' })
                accessor label = 'Button';

                @prop({ type: Boolean, default: false })
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
        `, 'Button.ts', { scene: 'src/scenes/Button.scene' });

        expect(contract).toEqual({
            scene: 'src/scenes/Button.scene',
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
        `, 'Panel.ts', { scene: 'src/scenes/Panel.scene' });

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
                @prop({ type: String, default: 'Button' })
                accessor label = 'Button';

                @event()
                readonly click = createEvent();

                @slot()
                icon!: unknown;
            }
        `, 'Button.ts', { scene: 'src/scenes/Button.scene' });

        expect(JSON.parse(descriptor)).toEqual({
            scene: 'src/scenes/Button.scene',
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
        expect(typeof prop({ type: String, default: 'Button' })).toBe('function');
        expect(typeof event()).toBe('function');
        expect(typeof slot()).toBe('function');
    });

    it('rejects non-literal decorator options', () => {
        expect(() => extractSceneScriptInterface(`
            const defaults = { type: String };

            @scene()
            export class Button {
                @prop(defaults)
                accessor label = 'Button';
            }
        `, 'Button.ts', { scene: 'src/scenes/Button.scene' })).toThrow('@prop argument must be an object literal.');
    });

    it('rejects legacy string prop type declarations', () => {
        expect(() => extractSceneScriptInterface(`
            @scene()
            export class Button {
                @prop({ type: 'string', default: 'Button' })
                accessor label = 'Button';
            }
        `, 'Button.ts', { scene: 'src/scenes/Button.scene' })).toThrow('@prop type must be String, Number, Boolean, or a struct class.');
    });

    it('extracts RectTransform struct props from constructor type declarations', () => {
        const contract = extractSceneScriptInterface(`
            export class RectTransform {
                x = 0;
                y = 0;
                width = 188;
                height = 48;

                reset() {
                    this.x = 0;
                }
            }

            @scene()
            export class Button {
                @prop({ type: RectTransform })
                set rectTransform(value: RectTransform) {}
            }
        `, 'Button.ts', { scene: 'src/scenes/Button.scene' });

        expect(contract.interface.props.rectTransform).toEqual({
            type: 'struct',
            struct: 'RectTransform',
            fields: {
                x: { type: 'number', default: 0 },
                y: { type: 'number', default: 0 },
                width: { type: 'number', default: 188 },
                height: { type: 'number', default: 48 },
            },
        });
    });

    it('rejects struct props with required constructor parameters', () => {
        expect(() => extractSceneScriptInterface(`
            export class RectTransform {
                x = 0;
                constructor(x: number) {
                    this.x = x;
                }
            }

            @scene()
            export class Button {
                @prop({ type: RectTransform })
                set rectTransform(value: RectTransform) {}
            }
        `, 'Button.ts', { scene: 'src/scenes/Button.scene' })).toThrow('Struct prop type RectTransform must be constructable with no required parameters.');
    });

    it('rejects struct props that are not exported', () => {
        expect(() => extractSceneScriptInterface(`
            class RectTransform {
                x = 0;
            }

            @scene()
            export class Button {
                @prop({ type: RectTransform })
                set rectTransform(value: RectTransform) {}
            }
        `, 'Button.ts', { scene: 'src/scenes/Button.scene' })).toThrow('Struct prop type RectTransform must be exported.');
    });

    it('rejects struct prop defaults', () => {
        expect(() => extractSceneScriptInterface(`
            export class RectTransform {
                x = 0;
            }

            @scene()
            export class Button {
                @prop({ type: RectTransform, default: 0 })
                set rectTransform(value: RectTransform) {}
            }
        `, 'Button.ts', { scene: 'src/scenes/Button.scene' })).toThrow('@prop default is only supported for primitive props.');
    });

    it('rejects @scene arguments because scripts are paired with colocated .scene files', () => {
        expect(() => extractSceneScriptInterface(`
            @scene('src/scenes/Button.scene')
            export class Button {}
        `, 'Button.ts', { scene: 'src/scenes/Button.scene' })).toThrow(
            '@scene does not accept arguments. Pair scripts by colocating a same-basename .ts file next to the .scene file.',
        );
    });
});
