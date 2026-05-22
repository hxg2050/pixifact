import { describe, expect, it } from 'vitest';
import { compileSceneTemplateToTs, parseSceneTemplate } from 'pixifact/compiler';

describe('Pixifact scene compiler spike', () => {
    it('parses a restricted XML scene template with interface and slot outlet', () => {
        const template = parseSceneTemplate(`
            <Scene name="Button" script="../src/scenes/Button.ts" class="Button">
              <Interface>
                <Prop name="label" type="string" default="Button" />
                <Prop name="disabled" type="boolean" default="false" />
                <Event name="click" />
                <Slot name="icon" multiple="false" />
              </Interface>

              <Container key="root" width="180" height="52">
                <Graphics key="background" shape="roundRect" width="180" height="52" radius="8" fill="#4169e1" />
                <Text key="label" text="Button" x="72" y="16" fontSize="16" fill="#ffffff" />
                <Container key="iconHost" x="20" y="14">
                  <slot name="icon" />
                </Container>
              </Container>
            </Scene>
        `);

        expect(template.name).toBe('Button');
        expect(template.script).toEqual({
            path: '../src/scenes/Button.ts',
            className: 'Button',
        });
        expect(template.interface.props.label).toEqual({
            type: 'string',
            default: 'Button',
        });
        expect(template.interface.props.disabled).toEqual({
            type: 'boolean',
            default: false,
        });
        expect(template.interface.events.click).toEqual({ type: 'action' });
        expect(template.interface.slots.icon).toEqual({ multiple: false });
        expect(template.root).toMatchObject({
            kind: 'pixi',
            type: 'Container',
            key: 'root',
            props: {
                width: 180,
                height: 52,
            },
        });
    });

    it('compiles a source scene into a typed PixiJS mount function', () => {
        const template = parseSceneTemplate(`
            <Scene name="Button">
              <Container key="root" width="180" height="52">
                <Graphics key="background" shape="roundRect" width="180" height="52" radius="8" fill="#4169e1" />
                <Text key="label" text="Button" x="72" y="16" fontSize="16" fill="#ffffff" />
                <Container key="iconHost" x="20" y="14">
                  <slot name="icon" />
                </Container>
              </Container>
            </Scene>
        `);

        const code = compileSceneTemplateToTs(template);

        expect(code).toContain(`import { Container, Graphics, Text } from 'pixi.js';`);
        expect(code).toContain('export type ButtonParts = {');
        expect(code).toContain('background: Graphics;');
        expect(code).toContain('label: Text;');
        expect(code).toContain('iconHost: Container;');
        expect(code).toContain('export function mountButtonScene(root: Container, actions: Record<string, () => void> = {}) {');
        expect(code).toContain('root.width = 180;');
        expect(code).toContain('const background = new Graphics();');
        expect(code).toContain('background.roundRect(0, 0, 180, 52, 8).fill(4286945);');
        expect(code).toContain('const label = new Text({ text: "Button", style: { fontSize: 16, fill: 16777215 } })');
        expect(code).toContain('root.addChild(background);');
        expect(code).toContain('iconHost.position.set(20, 14);');
        expect(code).toContain('return { root, background, label, iconHost };');
    });

    it('keeps scene instances opaque and compiles only their public props, events, and slot children', () => {
        const template = parseSceneTemplate(`
            <Scene name="MainMenu">
              <Container key="root">
                <Button key="startButton" scene="scenes/Button.scene" x="390" y="300" label="Start" @click="startGame">
                  <Sprite slot="icon" key="playIcon" texture="assets/icons/play.png" />
                </Button>
              </Container>
            </Scene>
        `);

        expect(template.root).toMatchObject({
            kind: 'pixi',
            type: 'Container',
            children: [
                {
                    kind: 'sceneInstance',
                    type: 'Button',
                    key: 'startButton',
                    scene: 'scenes/Button.scene',
                    props: {
                        x: 390,
                        y: 300,
                        label: 'Start',
                    },
                    events: {
                        click: 'startGame',
                    },
                },
            ],
        });

        const sceneInstance = template.root.kind === 'pixi' ? template.root.children[0] : undefined;
        expect(sceneInstance).toMatchObject({
            kind: 'sceneInstance',
            slots: {
                icon: [
                    {
                        kind: 'pixi',
                        type: 'Sprite',
                        key: 'playIcon',
                        props: {
                            texture: 'assets/icons/play.png',
                        },
                    },
                ],
            },
        });

        const code = compileSceneTemplateToTs(template);

        expect(code).toContain('const startButton = new Button();');
        expect(code).toContain('startButton.position.set(390, 300);');
        expect(code).toContain('startButton.label = "Start";');
        expect(code).toContain('startButton.onClick(actions.startGame);');
        expect(code).toContain('root.addChild(startButton);');
        expect(code).toContain('const playIcon = Sprite.from("assets/icons/play.png");');
        expect(code).toContain('startButton.slots.icon.addChild(playIcon);');
        expect(code).not.toContain('background');
        expect(code).not.toContain('hitArea');
    });
});
