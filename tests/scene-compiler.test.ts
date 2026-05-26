import { describe, expect, it } from 'vitest';
import { Container, Text } from 'pixi.js';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
    applySceneProposal,
    checkSceneProposal,
    connectSceneEvent,
    compileSceneTemplateToTs,
    createSceneRevision,
    mount,
    parseSceneTemplate,
    part,
    prop,
    serializeSceneTemplate,
    inspectSceneTemplate,
    createEvent,
    event,
    registerScene,
    registerSceneClass,
    registerSlot,
    scene,
    slot,
} from 'pixifact/compiler';
import { compileScenes, pixifactScenesPlugin } from 'pixifact/compiler-node';

describe('Pixifact scene compiler spike', () => {
    it('creates stable revisions for canonical compiler scene source', () => {
        const first = createSceneRevision('<Scene name="Button"><Text id="label" text="Play" /></Scene>');
        const second = createSceneRevision(`
            <Scene name="Button">
              <Text id="label" text="Play" />
            </Scene>
        `);

        expect(first).toBe(second);
        expect(first).toMatch(/^scene:\d+:[a-f0-9]{8}$/);
    });

    it('inspects compiler scene templates for external agents', () => {
        const summary = inspectSceneTemplate(parseSceneTemplate(`
            <Scene name="Button" script="src/scenes/Button.ts" width="180">
              <Container id="root" x="10">
                <Text id="label" text="Play" />
              </Container>
            </Scene>
        `));

        expect(summary).toEqual({
            name: 'Button',
            script: 'src/scenes/Button.ts',
            props: { width: 180 },
            nodeCount: 2,
            nodes: [
                {
                    id: 'root',
                    kind: 'pixi',
                    type: 'Container',
                    path: '0:root',
                    propKeys: ['x'],
                    childCount: 1,
                },
                {
                    id: 'label',
                    kind: 'pixi',
                    type: 'Text',
                    path: '0:root/0:label',
                    propKeys: ['text'],
                    childCount: 0,
                },
            ],
        });
    });

    it('checks compiler scene proposals without applying them', () => {
        const current = serializeSceneTemplate(parseSceneTemplate(`
            <Scene name="Button" script="src/scenes/Button.ts" width="180">
              <Text id="label" text="Start" x="10" />
            </Scene>
        `));
        const proposed = `
            <Scene name="Button" script="src/scenes/Button.ts" width="180">
              <Text id="label" text="Play" x="10" />
              <Sprite id="icon" texture="assets/play.png" />
            </Scene>
        `;

        const result = checkSceneProposal({
            currentContent: current,
            proposal: {
                kind: 'pixifact.sceneProposal.v1',
                scene: 'scenes/Button.scene',
                baseRevision: createSceneRevision(current),
                content: proposed,
            },
        });

        expect(result).toMatchObject({
            ok: true,
            scene: 'scenes/Button.scene',
            current: { name: 'Button' },
            proposed: { name: 'Button' },
        });
        expect(result.ok && result.canonicalContent).toContain('<Text id="label" text="Play" x="10" />');
        expect(result.ok && result.diffs).toEqual([
            {
                kind: 'nodePropChanged',
                path: '0:label',
                node: 'Text#label',
                prop: 'text',
                before: 'Start',
                after: 'Play',
            },
            {
                kind: 'nodeInserted',
                path: '1:icon',
                node: 'Sprite#icon',
            },
            {
                kind: 'childrenChanged',
                path: '__scene__',
                before: ['Text#label'],
                after: ['Text#label', 'Sprite#icon'],
            },
        ]);
    });

    it('rejects stale compiler scene proposals', () => {
        const current = '<Scene name="Button"><Text id="label" text="Start" /></Scene>';
        const result = checkSceneProposal({
            currentContent: current,
            proposal: {
                kind: 'pixifact.sceneProposal.v1',
                scene: 'scenes/Button.scene',
                baseRevision: 'sha256:stale',
                content: '<Scene name="Button"><Text id="label" text="Play" /></Scene>',
            },
        });

        expect(result).toMatchObject({
            ok: false,
            scene: 'scenes/Button.scene',
            baseRevision: 'sha256:stale',
            currentRevision: createSceneRevision(current),
            error: 'Scene proposal baseRevision does not match current scene revision.',
        });
    });

    it('rejects proposals that change the scene name', () => {
        const current = '<Scene name="Button"><Text id="label" text="Start" /></Scene>';
        const result = checkSceneProposal({
            currentContent: current,
            proposal: {
                kind: 'pixifact.sceneProposal.v1',
                scene: 'scenes/Button.scene',
                baseRevision: createSceneRevision(current),
                content: '<Scene name="Other"><Text id="label" text="Play" /></Scene>',
            },
        });

        expect(result).toMatchObject({
            ok: false,
            scene: 'scenes/Button.scene',
            error: 'Scene proposal cannot change Scene name from "Button" to "Other".',
        });
    });

    it('rejects unknown compiler Pixi node props', () => {
        const current = '<Scene name="Button"><Sprite id="icon" texture="assets/play.png" /></Scene>';
        const result = checkSceneProposal({
            currentContent: current,
            proposal: {
                kind: 'pixifact.sceneProposal.v1',
                scene: 'scenes/Button.scene',
                baseRevision: createSceneRevision(current),
                content: '<Scene name="Button"><Sprite id="icon" textrue="assets/play.png" /></Scene>',
            },
        });

        expect(result).toMatchObject({
            ok: false,
            scene: 'scenes/Button.scene',
            error: 'Scene proposal validation failed.',
            diagnostics: [{
                path: '0:icon',
                prop: 'textrue',
                expected: 'known Sprite prop',
                actual: 'unknown prop',
                hint: 'Use "texture" for Sprite image assets.',
            }],
        });
    });

    it('rejects compiler Pixi node props with invalid value types', () => {
        const current = '<Scene name="Button"><Text id="label" text="Start" fontSize="16" /></Scene>';
        const result = checkSceneProposal({
            currentContent: current,
            proposal: {
                kind: 'pixifact.sceneProposal.v1',
                scene: 'scenes/Button.scene',
                baseRevision: createSceneRevision(current),
                content: '<Scene name="Button"><Text id="label" text="Start" fontSize="large" /></Scene>',
            },
        });

        expect(result).toMatchObject({
            ok: false,
            scene: 'scenes/Button.scene',
            error: 'Scene proposal validation failed.',
            diagnostics: [{
                path: '0:label',
                prop: 'fontSize',
                expected: 'number',
                actual: 'string',
                hint: 'Set Text.fontSize to a numeric value.',
            }],
        });
    });

    it('accepts numeric font weight values parsed from scene attributes', () => {
        const current = '<Scene name="Button"><Text id="label" text="Start" fontWeight="700" /></Scene>';
        const result = checkSceneProposal({
            currentContent: current,
            proposal: {
                kind: 'pixifact.sceneProposal.v1',
                scene: 'scenes/Button.scene',
                baseRevision: createSceneRevision(current),
                content: '<Scene name="Button"><Text id="label" text="Play" fontWeight="700" /></Scene>',
            },
        });

        expect(result).toMatchObject({
            ok: true,
            scene: 'scenes/Button.scene',
        });
    });

    it('keeps known string props as strings when values look numeric', () => {
        const template = parseSceneTemplate('<Scene name="Hud"><Text id="score" text="000000" /><Text id="wave" text="01" /></Scene>');

        expect(template.children[0].kind === 'pixi' && template.children[0].props.text).toBe('000000');
        expect(template.children[1].kind === 'pixi' && template.children[1].props.text).toBe('01');
    });

    it('rejects missing or unsafe compiler texture references when assets are provided', () => {
        const current = '<Scene name="Button"><Sprite id="icon" texture="assets/play.png" /></Scene>';
        const result = checkSceneProposal({
            currentContent: current,
            existingAssets: new Set(['assets/play.png']),
            proposal: {
                kind: 'pixifact.sceneProposal.v1',
                scene: 'scenes/Button.scene',
                baseRevision: createSceneRevision(current),
                content: '<Scene name="Button"><Sprite id="icon" texture="../secret.png" /></Scene>',
            },
        });

        expect(result).toMatchObject({
            ok: false,
            scene: 'scenes/Button.scene',
            error: 'Scene proposal validation failed.',
            diagnostics: [{
                path: '0:icon',
                prop: 'texture',
                expected: 'project-relative asset path inside project root',
                actual: '../secret.png',
                hint: 'Use a project-relative path such as "assets/play.png".',
            }],
        });
    });

    it('validates Scene instance proposals against public contracts', () => {
        const current = '<Scene name="MainMenu"><Button id="start" scene="scenes/Button.scene" label="Start" /></Scene>';
        const result = checkSceneProposal({
            currentContent: current,
            sceneInterfaces: {
                'scenes/Button.scene': {
                    props: {
                        label: { type: 'string' },
                        disabled: { type: 'boolean' },
                    },
                    events: {
                        click: { type: 'action' },
                    },
                    slots: {
                        icon: {},
                    },
                },
            },
            proposal: {
                kind: 'pixifact.sceneProposal.v1',
                scene: 'scenes/MainMenu.scene',
                baseRevision: createSceneRevision(current),
                content: [
                    '<Scene name="MainMenu">',
                    '  <Button id="start" scene="scenes/Button.scene" label="Start" secret="true" @submit="submitForm">',
                    '    <Text slot="footer" id="footerText" text="Footer" />',
                    '  </Button>',
                    '</Scene>',
                ].join('\n'),
            },
        });

        expect(result).toMatchObject({
            ok: false,
            scene: 'scenes/MainMenu.scene',
            error: 'Scene proposal validation failed.',
            diagnostics: [
                {
                    path: '0:start',
                    prop: 'secret',
                    expected: 'public prop declared by scenes/Button.scene',
                    actual: 'unknown prop',
                },
                {
                    path: '0:start',
                    prop: '@submit',
                    expected: 'public event declared by scenes/Button.scene',
                    actual: 'unknown event',
                },
                {
                    path: '0:start/slot:footer',
                    prop: 'slot',
                    expected: 'public slot declared by scenes/Button.scene',
                    actual: 'unknown slot',
                },
            ],
        });
    });

    it('rejects Scene instance proposals when a contract index is provided but the instance contract is missing', () => {
        const current = '<Scene name="MainMenu"><Button id="start" scene="scenes/Button.scene" label="Start" /></Scene>';
        const result = checkSceneProposal({
            currentContent: current,
            sceneInterfaces: {},
            proposal: {
                kind: 'pixifact.sceneProposal.v1',
                scene: 'scenes/MainMenu.scene',
                baseRevision: createSceneRevision(current),
                content: '<Scene name="MainMenu"><Button id="start" scene="scenes/Button.scene" label="Start" /></Scene>',
            },
        });

        expect(result).toMatchObject({
            ok: false,
            scene: 'scenes/MainMenu.scene',
            error: 'Scene proposal validation failed.',
            diagnostics: [{
                path: '0:start',
                prop: 'scene',
                expected: 'known compiler Scene contract',
                actual: 'scenes/Button.scene',
                hint: 'Ensure the referenced .scene file exists and has a readable bound script.',
            }],
        });
    });

    it('applies compiler scene proposals by returning canonical content', () => {
        const current = '<Scene name="Button"><Text id="label" text="Start" /></Scene>';
        const result = applySceneProposal({
            currentContent: current,
            proposal: {
                kind: 'pixifact.sceneProposal.v1',
                scene: 'scenes/Button.scene',
                baseRevision: createSceneRevision(current),
                content: '<Scene name="Button"><Text id="label" text="Play" /></Scene>',
            },
        });

        expect(result).toMatchObject({
            ok: true,
            scene: 'scenes/Button.scene',
        });
        expect(result.ok && result.content).toBe('<Scene name="Button">\n  <Text id="label" text="Play" />\n</Scene>\n');
        expect(result.ok && result.diffs[0]).toMatchObject({
            kind: 'nodePropChanged',
            prop: 'text',
            before: 'Start',
            after: 'Play',
        });
    });

    it('parses a restricted XML scene template with scene props and slot outlet', () => {
        const template = parseSceneTemplate(`
            <Scene name="Button" script="src/scenes/Button.ts" width="180" height="52">
              <Graphics id="background" shape="roundRect" width="180" height="52" radius="8" fill="#4169e1" />
              <Text id="label" text="Button" x="72" y="16" fontSize="16" fill="#ffffff" />
              <Container id="iconHost" x="20" y="14">
                <slot name="icon" />
              </Container>
            </Scene>
        `);

        expect(template.name).toBe('Button');
        expect(template.script).toEqual({
            path: 'src/scenes/Button.ts',
        });
        expect(template.interface).toEqual({
            props: {},
            events: {},
            slots: {},
        });
        expect(template.props).toEqual({
            width: 180,
            height: 52,
        });
        expect(template.children[0]).toMatchObject({
            kind: 'pixi',
            type: 'Graphics',
            id: 'background',
            props: {
                width: 180,
                height: 52,
            },
        });
    });

    it('compiles a source scene into a typed PixiJS mount function', () => {
        const template = parseSceneTemplate(`
            <Scene name="Button" width="180" height="52">
              <Graphics id="background" shape="roundRect" width="180" height="52" radius="8" fill="#4169e1" fillAlpha="0.8" strokeColor="#ffffff" strokeWidth="2" strokeAlpha="0.5" />
              <Text id="label" text="Button" x="72" y="16" pivotX="10" pivotY="4" skewX="0.1" skewY="0.2" fontSize="16" fill="#ffffff" />
              <Container id="iconHost" x="20" y="14">
                <slot name="icon" />
              </Container>
            </Scene>
        `);

        const code = compileSceneTemplateToTs(template);

        expect(code).toContain(`import { Container, Graphics, Text } from 'pixi.js';`);
        expect(code).toContain('export type ButtonParts = {');
        expect(code).toContain('parts: {');
        expect(code).toContain('background: Graphics;');
        expect(code).toContain('label: Text;');
        expect(code).toContain('iconHost: Container;');
        expect(code).toContain('slots: Record<string, Container>;');
        expect(code).toContain('export function mountButtonScene(root: Container) {');
        expect(code).toContain('const __pixifactSlots: Record<string, Container> = {};');
        expect(code).toContain('root.width = 180;');
        expect(code).toContain('const background = new Graphics();');
        expect(code).toContain('background.label = "background";');
        expect(code).toContain('background.roundRect(0, 0, 180, 52, 8).fill({ color: 4286945, alpha: 0.8 }).stroke({ width: 2, color: 16777215, alpha: 0.5 });');
        expect(code).toContain('const label = new Text({ text: "Button", style: { fontSize: 16, fill: 16777215 } })');
        expect(code).toContain('label.pivot.set(10, 4);');
        expect(code).toContain('label.skew.set(0.1, 0.2);');
        expect(code).toContain('root.addChild(background);');
        expect(code).toContain('iconHost.position.set(20, 14);');
        expect(code).toContain('__pixifactSlots["icon"] = iconHost;');
        expect(code).toContain('registerSlot(root, "icon", iconHost);');
        expect(code).toContain('parts: { background, label, iconHost },');
        expect(code).toContain('slots: __pixifactSlots,');
    });

    it('keeps scene instances opaque and compiles only their public props, events, and slot children', () => {
        const template = parseSceneTemplate(`
            <Scene name="MainMenu">
              <Button id="startButton" scene="scenes/Button.scene" x="390" y="300" scaleX="1.2" scaleY="0.9" rotation="0.25" alpha="0.8" visible="true" zIndex="10" label="Start" @click="startGame">
                <Sprite slot="icon" id="playIcon" texture="assets/icons/play.png" anchorX="0.5" anchorY="0.5" tint="#ff0000" />
              </Button>
            </Scene>
        `);

        expect(template.children).toMatchObject([
            {
                kind: 'sceneInstance',
                type: 'Button',
                id: 'startButton',
                scene: 'scenes/Button.scene',
                props: {
                    x: 390,
                    y: 300,
                    scaleX: 1.2,
                    scaleY: 0.9,
                    rotation: 0.25,
                    alpha: 0.8,
                    visible: true,
                    zIndex: 10,
                    label: 'Start',
                },
                events: {
                    click: 'startGame',
                },
            },
        ]);

        expect(template.children[0]).toMatchObject({
            kind: 'sceneInstance',
            slots: {
                icon: [
                    {
                        kind: 'pixi',
                        type: 'Sprite',
                        id: 'playIcon',
                        props: {
                            texture: 'assets/icons/play.png',
                            anchorX: 0.5,
                            anchorY: 0.5,
                            tint: 0xff0000,
                        },
                    },
                ],
            },
        });

        const code = compileSceneTemplateToTs(template);

        expect(code).toContain('export function mountMainMenuScene(root: Container, actions: Record<string, () => void> = {}) {');
        expect(code).toContain('const startButton = new Button();');
        expect(code).toContain('startButton.position.set(390, 300);');
        expect(code).toContain('startButton.scale.set(1.2, 0.9);');
        expect(code).toContain('startButton.rotation = 0.25;');
        expect(code).toContain('startButton.alpha = 0.8;');
        expect(code).toContain('startButton.visible = true;');
        expect(code).toContain('startButton.zIndex = 10;');
        expect(code).toContain('root.sortableChildren = true;');
        expect(code).toContain('startButton.label = "Start";');
        expect(code).toContain('connectSceneEvent(startButton.click, "startGame", root, actions);');
        expect(code).toContain('root.addChild(startButton);');
        expect(code).toContain('const __pixifactTexture1 = await Assets.load("assets/icons/play.png");');
        expect(code).toContain('const playIcon = new Sprite({ texture: __pixifactTexture1 });');
        expect(code).toContain('playIcon.anchor.set(0.5, 0.5);');
        expect(code).toContain('playIcon.tint = 16711680;');
        expect(code).toContain('mount(startButton, playIcon, "icon");');
        expect(code).not.toContain('background');
        expect(code).not.toContain('hitArea');
    });

    it('compiles PixiJS sprite and text variants', () => {
        const template = parseSceneTemplate(`
            <Scene name="PixiVariants">
              <NineSliceSprite id="panel" texture="assets/panel.png" width="200" height="100" leftWidth="12" rightWidth="12" topHeight="8" bottomHeight="8" />
              <TilingSprite id="pattern" texture="assets/pattern.png" width="320" height="180" tilePositionX="4" tilePositionY="8" tileScaleX="0.5" tileScaleY="0.75" tileRotation="0.2" />
              <BitmapText id="score" text="100" fontSize="24" fill="#ffffff" />
              <HTMLText id="richText" text="&lt;b&gt;Ready&lt;/b&gt;" fontSize="18" fill="#ff0000" />
            </Scene>
        `);

        const code = compileSceneTemplateToTs(template);

        expect(code).toContain('BitmapText');
        expect(code).toContain('NineSliceSprite');
        expect(code).toContain('Assets');
        expect(code).toContain('const __pixifactTexture1 = await Assets.load("assets/panel.png");');
        expect(code).toContain('const __pixifactTexture2 = await Assets.load("assets/pattern.png");');
        expect(code).toContain('const panel = new NineSliceSprite({ texture: __pixifactTexture1 });');
        expect(code).toContain('panel.leftWidth = 12;');
        expect(code).toContain('panel.bottomHeight = 8;');
        expect(code).toContain('const pattern = new TilingSprite({ texture: __pixifactTexture2 });');
        expect(code).toContain('pattern.tilePosition.set(4, 8);');
        expect(code).toContain('pattern.tileScale.set(0.5, 0.75);');
        expect(code).toContain('pattern.tileRotation = 0.2;');
        expect(code).toContain('const score = new BitmapText({ text: "100", style: { fontSize: 24, fill: 16777215 } })');
        expect(code).toContain('const richText = new HTMLText({ text: "<b>Ready</b>", style: { fontSize: 18, fill: 16711680 } })');
    });

    it('mounts registered scene content through runtime decorators in plain TypeScript', () => {
        let RuntimeButton: typeof Container;

        @scene()
        class RuntimeButtonScene extends Container {
            @part()
            declare protected labelText: Text;

            @slot()
            declare readonly icon: Container;

            @event()
            readonly click = createEvent();

            readyText = '';

            @prop({ type: 'string', default: 'Play' })
            set labelTextValue(value: string) {
                this.labelText.text = value;
            }

            onMounted() {
                this.readyText = this.labelText.text;
            }
        }

        RuntimeButton = RuntimeButtonScene;

        registerScene('scenes/RuntimeButton.scene', {
            mount(root) {
                const labelText = new Text({ text: 'Button' });
                labelText.label = 'labelText';
                root.addChild(labelText);

                const iconHost = new Container();
                root.addChild(iconHost);
                registerSlot(root, 'icon', iconHost);

                return {
                    root,
                    parts: {
                        labelText,
                        iconHost,
                    },
                    slots: {
                        icon: iconHost,
                    },
                };
            },
        });
        registerSceneClass(RuntimeButton, 'scenes/RuntimeButton.scene');

        const button = new RuntimeButton();
        let clicked = false;
        button.click.connect(() => {
            clicked = true;
        });
        button.click.emit();

        const icon = new Container();
        mount(button, icon, 'icon');

        expect(button.children).toHaveLength(2);
        expect(button.readyText).toBe('Play');
        expect(clicked).toBe(true);
        expect((button.children[0] as Text).text).toBe('Play');
        expect(button.icon.children[0]).toBe(icon);
    });

    it('connects scene events to actions or root script methods', () => {
        const event = createEvent();
        const root = {
            started: false,
            startGame() {
                this.started = true;
            },
        };

        connectSceneEvent(event, 'startGame', root);
        event.emit();

        expect(root.started).toBe(true);

        let actionCalled = false;
        connectSceneEvent(event, 'externalAction', root, {
            externalAction() {
                actionCalled = true;
            },
        });
        event.emit();

        expect(actionCalled).toBe(true);
    });

    it('rejects duplicate ids in a scene template', () => {
        expect(() => parseSceneTemplate(`
            <Scene name="DuplicateIds">
              <Text id="labelText" />
              <Container>
                <Text id="labelText" />
              </Container>
            </Scene>
        `)).toThrow('Scene "DuplicateIds" has duplicate id "labelText".');
    });

    it('serializes a compiler scene template back to restricted XML', () => {
        const template = parseSceneTemplate(`
            <Scene name="MainMenu" script="src/scenes/MainMenu.ts" width="960" height="540">
              <Button id="startButton" scene="scenes/Button.scene" x="390" y="300" label="Start" @click="startGame">
                <Text slot="footer" id="hintText" text="Press Enter" fill="#ffffff" />
              </Button>
            </Scene>
        `);

        const source = serializeSceneTemplate(template);
        const next = parseSceneTemplate(source);

        expect(source).toContain('<Scene name="MainMenu" script="src/scenes/MainMenu.ts" width="960" height="540">');
        expect(source).not.toContain('<Interface>');
        expect(source).toContain('<Button id="startButton" scene="scenes/Button.scene" x="390" y="300" label="Start" @click="startGame">');
        expect(source).toContain('<Text id="hintText" slot="footer" text="Press Enter" fill="#ffffff" />');
        expect(next).toEqual(template);
    });

    it('generates scene registry files from a project scenes directory', async () => {
        const root = await mkdtemp(join(tmpdir(), 'pixifact-scenes-'));
        try {
            await mkdir(join(root, 'scenes'));
            await mkdir(join(root, 'src', 'scenes'), { recursive: true });
            await writeFile(join(root, 'scenes', 'Button.scene'), `
                <Scene name="Button" script="src/scenes/Button.ts" width="120" height="40">
                  <Text id="labelText" text="Button" />
                  <Sprite id="icon" texture="assets/btn.png" />
                </Scene>
            `);
            await mkdir(join(root, 'assets'), { recursive: true });
            await writeFile(join(root, 'assets', 'btn.png'), 'fake-png');
            await writeFile(join(root, 'src', 'scenes', 'Button.ts'), `
                import { Container, Text } from 'pixi.js';
                import { createEvent, event, part, prop, scene, slot } from 'pixifact/compiler';

                @scene()
                export class Button extends Container {
                    @part()
                    protected declare labelText: Text;

                    @prop({ type: 'string', default: 'Button' })
                    accessor label = 'Button';

                    @event()
                    readonly click = createEvent();

                    @slot()
                    icon!: Container;
                }
            `);

            await compileScenes({ projectRoot: root });

            const generated = await readFile(join(root, '.pixifact', 'generated', 'Button.scene.generated.ts'), 'utf8');
            const registry = await readFile(join(root, '.pixifact', 'generated', 'scenes.generated.ts'), 'utf8');
            const source = await readFile(join(root, 'scenes', 'Button.scene'), 'utf8');

            expect(generated).toContain('registerScene("scenes/Button.scene"');
            expect(generated).toContain('registerSceneClass(Button, "scenes/Button.scene");');
            expect(generated).toContain('import { Button } from "../../src/scenes/Button";');
            expect(generated).toContain('import __pixifactTextureUrl1 from "../../assets/btn.png?url";');
            expect(generated).toContain('const __pixifactTexture1 = await Assets.load(__pixifactTextureUrl1);');
            expect(generated).toContain('export function mountButtonScene(root: Container)');
            expect(source).not.toContain('<Interface>');
            expect(registry).toBe("import './Button.scene.generated';\n");
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it('resolves the Vite virtual scene registry to the generated project cache', () => {
        const plugin = pixifactScenesPlugin({
            projectRoot: '/projects/game',
        });

        expect(plugin.resolveId('pixifact:scenes')).toBe(join('/projects/game', '.pixifact', 'generated', 'scenes.generated.ts'));
        expect(plugin.resolveId('pixifact:other')).toBeUndefined();
    });

    it('rejects scene files whose name does not match the bound @scene class', async () => {
        const root = await mkdtemp(join(tmpdir(), 'pixifact-scenes-'));
        try {
            await mkdir(join(root, 'scenes'));
            await mkdir(join(root, 'src', 'scenes'), { recursive: true });
            await writeFile(join(root, 'scenes', 'Button.scene'), '<Scene name="Button" script="src/scenes/Button.ts" />');
            await writeFile(join(root, 'src', 'scenes', 'Button.ts'), `
                import { Container } from 'pixi.js';
                import { scene } from 'pixifact/compiler';

                @scene()
                export class PrimaryButton extends Container {}
            `);

            await expect(compileScenes({ projectRoot: root })).rejects.toThrow('Scene "scenes/Button.scene" name "Button" must match @scene class "PrimaryButton".');
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
