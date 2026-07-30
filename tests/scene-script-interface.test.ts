import { describe, expect, it } from 'vitest';
import {
    emitSceneScriptInterfaceDescriptor,
    extractSceneScriptInterfaces,
    extractSceneScriptInterface,
} from 'pixifact/compiler-node';
import {
    event,
    part,
    prop,
    scene,
    slot,
} from 'pixifact/scene';

describe('scene script interface extractor', () => {
    it('extracts declare props and static variants without executing TypeScript', () => {
        const contract = extractSceneScriptInterface(`
            import { Group } from 'pixifact/runtime';
            import { defineVariants, prop, scene } from 'pixifact/scene';

            const buttonTones = defineVariants({
                primary: {
                    background: '#24456f',
                    border: '#f2ce76',
                    text: '#fff3cf',
                },
                danger: {
                    background: '#713044',
                    border: '#ff9eb2',
                    text: '#fff0f4',
                },
            });

            @scene()
            export class Button extends Group {
                @prop({ default: 'Button' })
                declare label: string;

                @prop({ default: 'primary', variants: buttonTones })
                declare tone: keyof typeof buttonTones;
            }
        `, 'Button.ts', { scene: 'src/scenes/Button.scene' });

        expect(contract.interface.props).toEqual({
            label: {
                type: 'string',
                default: 'Button',
            },
            tone: {
                type: 'variant',
                default: 'primary',
                variants: {
                    primary: {
                        background: '#24456f',
                        border: '#f2ce76',
                        text: '#fff3cf',
                    },
                    danger: {
                        background: '#713044',
                        border: '#ff9eb2',
                        text: '#fff0f4',
                    },
                },
            },
        });
    });

    it('rejects executable prop members and dynamic variants', () => {
        expect(() => extractSceneScriptInterface(`
            @scene()
            export class Button {
                @prop({ default: 'Button' })
                set label(value: string) {}
            }
        `, 'Button.ts', { scene: 'src/scenes/Button.scene' })).toThrow(
            '@prop "label" must decorate a declare property without an initializer.',
        );

        expect(() => extractSceneScriptInterface(`
            const buttonTones = defineVariants(loadTheme());

            @scene()
            export class Button {
                @prop({ default: 'primary', variants: buttonTones })
                declare tone: keyof typeof buttonTones;
            }
        `, 'Button.ts', { scene: 'src/scenes/Button.scene' })).toThrow(
            'defineVariants argument must be an object literal.',
        );
    });

    it('extracts scene public contract from narrow TypeScript decorators', () => {
        const contract = extractSceneScriptInterface(`
            import { Text } from 'pixi.js';
import { Group } from 'pixifact/runtime';
            import { event, part, prop, scene, slot } from 'pixifact/scene';

            @scene()
            export class Button extends Group {
                @prop({ default: 'Button' })
                declare label: string;

                @prop({ default: false })
                declare disabled: boolean;

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

    it('composes inherited public contracts across scene scripts', () => {
        const contracts = extractSceneScriptInterfaces([
            {
                scene: 'src/ui/BaseControl.scene',
                fileName: 'BaseControl.ts',
                source: `
                    @scene()
                    export class BaseControl {
                        @prop({ default: 'base' })
                        declare tone: string;

                        @prop({ default: 8 })
                        declare padding: number;

                        @event()
                        readonly press = createEvent();

                        @slot()
                        default!: unknown;
                    }
                `,
            },
            {
                scene: 'src/ui/Button.scene',
                fileName: 'Button.ts',
                source: `
                    @scene()
                    export class Button extends BaseControl {
                        @prop({ default: 'primary' })
                        declare tone: string;

                        @prop({ default: false })
                        declare disabled: boolean;
                    }
                `,
            },
        ]);

        expect(contracts['src/ui/Button.scene'].interface).toEqual({
            props: {
                tone: {
                    type: 'string',
                    default: 'primary',
                },
                padding: {
                    type: 'number',
                    default: 8,
                },
                disabled: {
                    type: 'boolean',
                    default: false,
                },
            },
            events: {
                press: {
                    type: 'action',
                },
            },
            slots: {
                default: {},
            },
        });
    });

    it('resolves inherited contracts through explicit relative imports', () => {
        const contracts = extractSceneScriptInterfaces([
            {
                scene: 'src/base/BasePanel.scene',
                fileName: 'src/base/BasePanel.ts',
                source: `
                    @scene()
                    export class BasePanel {
                        @prop({ default: 8 })
                        declare padding: number;
                    }
                `,
            },
            {
                scene: 'src/legacy/BasePanel.scene',
                fileName: 'src/legacy/BasePanel.ts',
                source: `
                    @scene()
                    export class BasePanel {
                        @prop({ default: 99 })
                        declare padding: number;
                    }
                `,
            },
            {
                scene: 'src/ui/Button.scene',
                fileName: 'src/ui/Button.ts',
                source: `
                    import { BasePanel } from '../base/BasePanel';

                    @scene()
                    export class Button extends BasePanel {
                        @prop({ default: 'primary' })
                        declare tone: string;
                    }
                `,
            },
        ]);

        expect(contracts['src/ui/Button.scene'].interface.props).toEqual({
            padding: {
                type: 'number',
                default: 8,
            },
            tone: {
                type: 'string',
                default: 'primary',
            },
        });
    });

    it('rejects ambiguous cross-file inheritance without an import source', () => {
        expect(() => extractSceneScriptInterfaces([
            {
                scene: 'src/base/BasePanel.scene',
                fileName: 'src/base/BasePanel.ts',
                source: `
                    @scene()
                    export class BasePanel {
                        @prop({ default: 8 })
                        declare padding: number;
                    }
                `,
            },
            {
                scene: 'src/legacy/BasePanel.scene',
                fileName: 'src/legacy/BasePanel.ts',
                source: `
                    @scene()
                    export class BasePanel {
                        @prop({ default: 99 })
                        declare padding: number;
                    }
                `,
            },
            {
                scene: 'src/ui/Button.scene',
                fileName: 'src/ui/Button.ts',
                source: `
                    @scene()
                    export class Button extends BasePanel {
                    }
                `,
            },
        ])).toThrow('Scene script parent class "BasePanel" is ambiguous for "Button".');
    });

    it('emits a stable JSON descriptor for editor and AI consumption', () => {
        const descriptor = emitSceneScriptInterfaceDescriptor(`
            @scene()
            export class Button {
                @prop({ default: 'Button' })
                declare label: string;

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
        expect(typeof prop({ default: 'Button' })).toBe('function');
        expect(typeof event()).toBe('function');
        expect(typeof slot()).toBe('function');
    });

    it('rejects non-literal decorator options', () => {
        expect(() => extractSceneScriptInterface(`
            const defaults = { default: 'Button' };

            @scene()
            export class Button {
                @prop(defaults)
                declare label: string;
            }
        `, 'Button.ts', { scene: 'src/scenes/Button.scene' })).toThrow('@prop argument must be an object literal.');
    });

    it('rejects explicit prop type options because TypeScript owns the type', () => {
        expect(() => extractSceneScriptInterface(`
            @scene()
            export class Button {
                @prop({ type: 'string', default: 'Button' })
                declare label: string;
            }
        `, 'Button.ts', { scene: 'src/scenes/Button.scene' })).toThrow('@prop type is inferred from the TypeScript property declaration; remove the type option.');
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
                @prop({})
                declare rectTransform: RectTransform;
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
                @prop({})
                declare rectTransform: RectTransform;
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
                @prop({})
                declare rectTransform: RectTransform;
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
                @prop({ default: 0 })
                declare rectTransform: RectTransform;
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

    it('rejects Scene constructors with parameters', () => {
        expect(() => extractSceneScriptInterface(`
            @scene()
            export class Button {
                constructor(label: string) {}
            }
        `, 'Button.ts', { scene: 'src/scenes/Button.scene' })).toThrow(
            '@scene class "Button" must not declare constructor parameters. Use @prop() or an explicit method after construction.',
        );
    });
});
