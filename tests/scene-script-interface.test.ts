import { describe, expect, it } from 'vitest';
import { extractSceneScriptInterface } from 'pixifact/compiler';

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

                @slot({ multiple: false })
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
                    icon: {
                        multiple: false,
                    },
                },
            },
        });
    });

    it('supports explicit event and slot names', () => {
        const contract = extractSceneScriptInterface(`
            @scene('./Panel.scene')
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
            footer: {
                multiple: true,
            },
        });
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
