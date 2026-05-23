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
            import { Container } from 'pixi.js';
            import { event, prop, scene, slot } from 'pixifact/compiler';

            @scene('./Button.scene')
            export class Button extends Container {
                @prop({ type: 'string', default: 'Button' })
                accessor label = 'Button';

                @prop({ type: 'boolean', default: false })
                accessor disabled = false;

                @event()
                onClick(handler: () => void) {}

                @slot()
                icon!: Container;
            }
        `);

        expect(contract).toEqual({
            scene: './Button.scene',
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
        });
    });

    it('supports explicit event and slot names', () => {
        const contract = extractSceneScriptInterface(`
            @scene({ scene: './Panel.scene' })
            export class Panel {
                @event({ name: 'close' })
                handleClose() {}

                @slot({ name: 'footer' })
                footerSlot!: unknown;
            }
        `);

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
            @scene('./Button.scene')
            export class Button {
                @prop({ type: 'string', default: 'Button' })
                accessor label = 'Button';

                @event()
                onClick() {}

                @slot()
                icon!: unknown;
            }
        `);

        expect(JSON.parse(descriptor)).toEqual({
            scene: './Button.scene',
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
        });
        expect(descriptor.endsWith('\n')).toBe(true);
    });

    it('exports no-op decorator factories for real scene scripts', () => {
        expect(typeof scene('./Button.scene')).toBe('function');
        expect(typeof scene({ scene: './Button.scene' })).toBe('function');
        expect(typeof part()).toBe('function');
        expect(typeof part({ id: 'labelText' })).toBe('function');
        expect(typeof prop({ type: 'string', default: 'Button' })).toBe('function');
        expect(typeof event()).toBe('function');
        expect(typeof slot()).toBe('function');
    });

    it('rejects non-literal decorator options', () => {
        expect(() => extractSceneScriptInterface(`
            const defaults = { type: 'string' };

            @scene('./Button.scene')
            export class Button {
                @prop(defaults)
                accessor label = 'Button';
            }
        `)).toThrow('@prop argument must be an object literal.');
    });
});
