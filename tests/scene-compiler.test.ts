import { describe, expect, it } from 'vitest';
import { Container, Text } from 'pixi.js';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
    connectSceneEvent,
    compileSceneTemplateToTs,
    createSceneRevision,
    builtinSceneAssetId,
    builtinSceneInterfaces,
    generatedSceneModuleImport,
    generatedSceneModulePath,
    mount,
    normalizeSceneAssetId,
    parseSceneTemplate,
    pairedSceneScriptPath,
    part,
    prop,
    resolveSceneReference,
    serializeSceneTemplate,
    inspectSceneTemplate,
    createEvent,
    event,
    registerScene,
    registerSceneClass,
    registerSlot,
    scene,
    sceneClassAlias,
    sceneLocalName,
    slot,
    validateSceneContent,
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

    it('normalizes compiler Scene asset paths and paired script paths', () => {
        expect(normalizeSceneAssetId('src\\ui\\Button.scene')).toBe('src/ui/Button.scene');
        expect(normalizeSceneAssetId('pixifact:VBoxContainer.scene')).toBe('pixifact:VBoxContainer.scene');
        expect(pairedSceneScriptPath('src/ui/Button.scene')).toBe('src/ui/Button.ts');
        expect(pairedSceneScriptPath('pixifact:VBoxContainer.scene')).toBe('VBoxContainer.ts');
        expect(sceneLocalName('src/features/shop/Button.scene')).toBe('Button');
        expect(sceneLocalName('pixifact:VBoxContainer.scene')).toBe('VBoxContainer');
        expect(generatedSceneModulePath('src/features/shop/Button.scene')).toBe('src/features/shop/Button.scene.generated.ts');
        expect(generatedSceneModulePath('pixifact:VBoxContainer.scene')).toBe('pixifact-builtin/VBoxContainer.scene.generated.ts');
        expect(generatedSceneModuleImport('src/features/shop/Button.scene')).toBe('./src/features/shop/Button.scene.generated');
        expect(sceneClassAlias('src/features/shop/Button.scene')).toBe('SceneClass_src_features_shop_Button');
        expect(sceneClassAlias('pixifact:VBoxContainer.scene')).toBe('BuiltinSceneClass_VBoxContainer');
    });

    it('keeps Scene asset paths browser-safe', async () => {
        const source = await readFile('packages/pixifact/src/compiler/sceneAssetPair.ts', 'utf8');

        expect(source).not.toContain('node:path');
        expect(source).not.toMatch(/\bpath\./);
    });

    it('resolves relative and project-relative Scene references from a containing scene', () => {
        expect(resolveSceneReference('src/menu/MainMenu.scene', './Button.scene')).toBe('src/menu/Button.scene');
        expect(resolveSceneReference('src/menu/MainMenu.scene', '../ui/Button.scene')).toBe('src/ui/Button.scene');
        expect(resolveSceneReference('src/menu/MainMenu.scene', '..\\ui\\Button.scene')).toBe('src/ui/Button.scene');
        expect(resolveSceneReference('src/menu/MainMenu.scene', 'src/shared/Panel.scene')).toBe('src/shared/Panel.scene');
        expect(resolveSceneReference('src/menu/MainMenu.scene', 'pixifact:VBoxContainer.scene')).toBe('pixifact:VBoxContainer.scene');
        expect(() => resolveSceneReference('src/menu/MainMenu.scene', 'Button')).toThrow('Scene references must use .scene paths.');
        expect(() => resolveSceneReference('src/menu/MainMenu.scene', '../../../Button.scene')).toThrow('must stay inside projectRoot');
    });

    it('creates stable non-colliding Scene class aliases', () => {
        expect(sceneClassAlias('src/features/shop/Button.scene')).toBe('SceneClass_src_features_shop_Button');

        const aliases = [
            sceneClassAlias('src/foo_bar/Button.scene'),
            sceneClassAlias('src/foo-bar/Button.scene'),
            sceneClassAlias('src/foo/bar/Button.scene'),
        ];
        expect(new Set(aliases).size).toBe(3);
        expect(aliases).toEqual([
            'SceneClass_src_foo_x5f_bar_Button',
            'SceneClass_src_foo_x2d_bar_Button',
            'SceneClass_src_foo_bar_Button',
        ]);
    });

    it('inspects compiler scene templates for external agents', () => {
        const summary = inspectSceneTemplate(parseSceneTemplate(`
            <Scene name="Button" width="180">
              <Container id="root" x="10">
                <Text id="label" text="Play" />
              </Container>
            </Scene>
        `));

        expect(summary).toEqual({
            name: 'Button',
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

    it('validates compiler scene content and returns canonical source', () => {
        const result = validateSceneContent({
            scene: 'scenes/Button.scene',
            content: `
            <Scene name="Button" width="180">
              <Text id="label" text="Play" x="10" />
              <Sprite id="icon" texture="assets/play.png" />
            </Scene>
        `,
        });

        expect(result).toMatchObject({
            ok: true,
            scene: 'scenes/Button.scene',
            summary: {
                name: 'Button',
                nodeCount: 2,
            },
        });
        expect(result.ok && result.canonicalContent).toContain('<Text id="label" text="Play" x="10" />');
        expect(result.ok && result.canonicalContent).toContain('<Sprite id="icon" texture="assets/play.png" />');
    });

    it('rejects unknown compiler Pixi node props', () => {
        const result = validateSceneContent({
            scene: 'scenes/Button.scene',
            content: '<Scene name="Button"><Sprite id="icon" textrue="assets/play.png" /></Scene>',
        });

        expect(result).toMatchObject({
            ok: false,
            scene: 'scenes/Button.scene',
            error: 'Scene validation failed.',
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
        const result = validateSceneContent({
            scene: 'scenes/Button.scene',
            content: '<Scene name="Button"><Text id="label" text="Start" fontSize="large" /></Scene>',
        });

        expect(result).toMatchObject({
            ok: false,
            scene: 'scenes/Button.scene',
            error: 'Scene validation failed.',
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
        const result = validateSceneContent({
            scene: 'scenes/Button.scene',
            content: '<Scene name="Button"><Text id="label" text="Play" fontWeight="700" /></Scene>',
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
        const result = validateSceneContent({
            scene: 'scenes/Button.scene',
            content: '<Scene name="Button"><Sprite id="icon" texture="../secret.png" /></Scene>',
            existingAssets: new Set(['assets/play.png']),
        });

        expect(result).toMatchObject({
            ok: false,
            scene: 'scenes/Button.scene',
            error: 'Scene validation failed.',
            diagnostics: [{
                path: '0:icon',
                prop: 'texture',
                expected: 'project-relative asset path inside project root',
                actual: '../secret.png',
                hint: 'Use a project-relative path such as "assets/play.png".',
            }],
        });
    });

    it('validates Scene instances against public contracts', () => {
        const result = validateSceneContent({
            scene: 'scenes/MainMenu.scene',
            content: [
                '<Scene name="MainMenu">',
                '  <Button id="start" scene="scenes/Button.scene" label="Start" secret="true" @submit="submitForm">',
                '    <Text slot="footer" id="footerText" text="Footer" />',
                '  </Button>',
                '</Scene>',
            ].join('\n'),
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
        });

        expect(result).toMatchObject({
            ok: false,
            scene: 'scenes/MainMenu.scene',
            error: 'Scene validation failed.',
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

    it('rejects Scene instances when a contract index is provided but the instance contract is missing', () => {
        const result = validateSceneContent({
            scene: 'scenes/MainMenu.scene',
            content: '<Scene name="MainMenu"><Button id="start" scene="scenes/Button.scene" label="Start" /></Scene>',
            sceneInterfaces: {},
        });

        expect(result).toMatchObject({
            ok: false,
            scene: 'scenes/MainMenu.scene',
            error: 'Scene validation failed.',
            diagnostics: [{
                path: '0:start',
                prop: 'scene',
                expected: 'known compiler Scene contract',
                actual: 'scenes/Button.scene',
                hint: 'Ensure the referenced .scene file exists and has a readable paired script.',
            }],
        });
    });

    it('parses a restricted XML scene template with scene props and slot outlet', () => {
        const template = parseSceneTemplate(`
            <Scene name="Button" width="180" height="52">
              <Graphics id="background" shape="roundRect" width="180" height="52" radius="8" fill="#4169e1" />
              <Text id="label" text="Button" x="72" y="16" fontSize="16" fill="#ffffff" />
              <Container id="iconHost" x="20" y="14">
                <slot name="icon" />
              </Container>
            </Scene>
        `);

        expect(template.name).toBe('Button');
        expect('script' in template).toBe(false);
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

    it('rejects root script attributes because Scene scripts are paired by file path', () => {
        expect(() => parseSceneTemplate('<Scene name="Button" script="src/scenes/Button.ts" />'))
            .toThrow('Scene script binding is inferred from the colocated TypeScript file.');
    });

    it('does not treat empty explicit Scene references as built-in defaults', () => {
        expect(() => validateSceneContent({
            scene: 'src/scenes/MainMenu.scene',
            content: '<Scene name="MainMenu"><VBoxContainer scene="" /></Scene>',
            sceneInterfaces: builtinSceneInterfaces(),
            normalizeSceneReference: (scenePath) => resolveSceneReference('src/scenes/MainMenu.scene', scenePath),
        })).not.toThrow();

        expect(validateSceneContent({
            scene: 'src/scenes/MainMenu.scene',
            content: '<Scene name="MainMenu"><VBoxContainer scene="" /></Scene>',
            sceneInterfaces: builtinSceneInterfaces(),
            normalizeSceneReference: (scenePath) => resolveSceneReference('src/scenes/MainMenu.scene', scenePath),
        })).toMatchObject({
            ok: false,
            diagnostics: [{
                path: '0:sceneInstance',
                prop: 'scene',
                expected: 'project-relative or relative .scene path',
                actual: '',
            }],
        });
    });

    it('rejects root class attributes because Scene classes are paired by script', () => {
        expect(() => parseSceneTemplate('<Scene name="Button" class="Button" />'))
            .toThrow('Scene class is inferred from the paired script @scene class; remove the class attribute.');
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

    it('parses, serializes, validates, and compiles structured Scene instance props', () => {
        const template = parseSceneTemplate(`
            <Scene name="MainMenu">
              <Button id="startButton" scene="scenes/Button.scene" text="Restart" rectTransform.x="150" rectTransform.y="692" rectTransform.width="420" rectTransform.height="92" />
            </Scene>
        `);

        expect(template.children[0]).toMatchObject({
            kind: 'sceneInstance',
            props: {
                text: 'Restart',
                rectTransform: {
                    x: 150,
                    y: 692,
                    width: 420,
                    height: 92,
                },
            },
        });

        const source = serializeSceneTemplate(template);
        expect(source).toContain('rectTransform.x="150"');
        expect(source).toContain('rectTransform.y="692"');
        expect(source).toContain('rectTransform.width="420"');
        expect(source).toContain('rectTransform.height="92"');
        expect(source).not.toContain('rectTransform="[object Object]"');
        expect(parseSceneTemplate(source)).toEqual(template);

        const sceneInterfaces = {
            'scenes/Button.scene': {
                props: {
                    text: { type: 'string' },
                    rectTransform: {
                        type: 'struct',
                        struct: 'RectTransform',
                        fields: {
                            x: { type: 'number', default: 0 },
                            y: { type: 'number', default: 0 },
                            width: { type: 'number', default: 188 },
                            height: { type: 'number', default: 48 },
                        },
                    },
                },
                events: {},
                slots: {},
            },
        } satisfies Record<string, import('../packages/pixifact/src/compiler/spec').SceneTemplateInterface>;

        expect(validateSceneContent({
            scene: 'scenes/MainMenu.scene',
            content: source,
            sceneInterfaces,
        })).toMatchObject({
            ok: true,
        });

        const code = compileSceneTemplateToTs(template, {
            sceneImports: [{
                exportName: 'Button',
                localName: 'Button',
                source: '../src/scenes/Button',
            }],
            sceneClassAliases: {
                'scenes/Button.scene': 'Button',
            },
            sceneInterfaces,
        });

        expect(code).toContain('import { Button, RectTransform } from "../src/scenes/Button";');
        expect(code).toContain('const startButton = new Button();');
        expect(code).toContain('startButton.text = "Restart";');
        expect(code).toContain('const startButtonRectTransform = new RectTransform();');
        expect(code).toContain('startButtonRectTransform.x = 150;');
        expect(code).toContain('startButtonRectTransform.y = 692;');
        expect(code).toContain('startButtonRectTransform.width = 420;');
        expect(code).toContain('startButtonRectTransform.height = 92;');
        expect(code).toContain('startButton.rectTransform = startButtonRectTransform;');
        expect(code).not.toContain('startButton.rectTransform = {');

        const anonymousCode = compileSceneTemplateToTs(parseSceneTemplate(`
            <Scene name="MainMenu">
              <Button scene="scenes/Button.scene" rectTransform.width="420" />
            </Scene>
        `), {
            sceneImports: [{
                exportName: 'Button',
                localName: 'Button',
                source: '../src/scenes/Button',
            }],
            sceneClassAliases: {
                'scenes/Button.scene': 'Button',
            },
            sceneInterfaces,
        });

        expect(anonymousCode).toContain('const button1RectTransform = new RectTransform();');
        expect(anonymousCode).toContain('button1RectTransform.width = 420;');
        expect(anonymousCode).toContain('button1.rectTransform = button1RectTransform;');
        expect(anonymousCode).not.toContain('button1.rectTransform = {');
    });

    it('rejects structured Scene instance props with unknown fields or invalid field values', () => {
        const sceneInterfaces = {
            'scenes/Button.scene': {
                props: {
                    rectTransform: {
                        type: 'struct',
                        struct: 'RectTransform',
                        fields: {
                            x: { type: 'number', default: 0 },
                            y: { type: 'number', default: 0 },
                            width: { type: 'number', default: 188 },
                            height: { type: 'number', default: 48 },
                        },
                    },
                },
                events: {},
                slots: {},
            },
        } satisfies Record<string, import('../packages/pixifact/src/compiler/spec').SceneTemplateInterface>;

        const result = validateSceneContent({
            scene: 'scenes/MainMenu.scene',
            content: '<Scene name="MainMenu"><Button id="start" scene="scenes/Button.scene" rectTransform.foo="1" rectTransform.width="wide" /></Scene>',
            sceneInterfaces,
        });

        expect(result).toMatchObject({
            ok: false,
            diagnostics: [
                {
                    path: '0:start',
                    prop: 'rectTransform.foo',
                    expected: 'field declared by RectTransform',
                    actual: 'unknown field',
                },
                {
                    path: '0:start',
                    prop: 'rectTransform.width',
                    expected: 'number',
                    actual: 'string',
                },
            ],
        });
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

            @prop({ type: String, default: 'Play' })
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
            <Scene name="MainMenu" width="960" height="540">
              <Button id="startButton" scene="scenes/Button.scene" x="390" y="300" label="Start" @click="startGame">
                <Text slot="footer" id="hintText" text="Press Enter" fill="#ffffff" />
              </Button>
            </Scene>
        `);

        const source = serializeSceneTemplate(template);
        const next = parseSceneTemplate(source);

        expect(source).toContain('<Scene name="MainMenu" width="960" height="540">');
        expect(source).not.toContain('script=');
        expect(source).not.toContain('<Interface>');
        expect(source).toContain('<Button id="startButton" scene="scenes/Button.scene" x="390" y="300" label="Start" @click="startGame">');
        expect(source).toContain('<Text id="hintText" slot="footer" text="Press Enter" fill="#ffffff" />');
        expect(next).toEqual(template);
    });

    it('resolves built-in Scene tags without serializing internal scene ids', () => {
        const template = parseSceneTemplate(`
            <Scene name="MainMenu">
              <VBoxContainer id="menuStack" gap="12" alignX="center">
                <Text id="title" text="Start" />
              </VBoxContainer>
            </Scene>
        `);

        expect(template.children[0]).toMatchObject({
            kind: 'sceneInstance',
            type: 'VBoxContainer',
            id: 'menuStack',
            scene: builtinSceneAssetId('VBoxContainer'),
            props: {
                gap: 12,
                alignX: 'center',
            },
            slots: {
                default: [{
                    kind: 'pixi',
                    type: 'Text',
                    id: 'title',
                }],
            },
        });

        const source = serializeSceneTemplate(template);
        expect(source).toContain('<VBoxContainer id="menuStack" gap="12" alignX="center">');
        expect(source).not.toContain('scene="pixifact:VBoxContainer.scene"');
        expect(parseSceneTemplate(source)).toEqual(template);
        expect(validateSceneContent({
            scene: 'src/scenes/MainMenu.scene',
            content: source,
            sceneInterfaces: builtinSceneInterfaces(),
        })).toMatchObject({
            ok: true,
        });
    });

    it('generates scene registry files from colocated Scene asset pairs', async () => {
        const root = await mkdtemp(join(tmpdir(), 'pixifact-scenes-'));
        try {
            await mkdir(join(root, 'src', 'ui'), { recursive: true });
            await mkdir(join(root, 'src', 'menu'), { recursive: true });
            await mkdir(join(root, 'src', 'screens'), { recursive: true });
            await mkdir(join(root, 'src', 'assets'), { recursive: true });
            await mkdir(join(root, 'src', 'build'), { recursive: true });
            await mkdir(join(root, 'src', 'generated'), { recursive: true });
            await writeFile(join(root, 'src', 'assets', 'btn.png'), 'fake-png');
            await writeFile(join(root, 'src', 'ui', 'Button.scene'), `
                <Scene name="Button" width="120" height="40">
                  <Text id="labelText" text="Button" />
                  <Sprite id="icon" texture="src/assets/btn.png" />
                </Scene>
            `);
            await writeFile(join(root, 'src', 'ui', 'Button.ts'), `
                import { Container, Text } from 'pixi.js';
                import { createEvent, event, part, prop, scene, slot } from 'pixifact/compiler';

                @scene()
                export class Button extends Container {
                    @part()
                    protected declare labelText: Text;

                    @prop({ type: String, default: 'Button' })
                    accessor label = 'Button';

                    @event()
                    readonly click = createEvent();

                    @slot()
                    icon!: Container;
                }
            `);
            await writeFile(join(root, 'src', 'menu', 'Button.scene'), '<Scene name="Button" />');
            await writeFile(join(root, 'src', 'menu', 'Button.ts'), `
                import { Container } from 'pixi.js';
                import { scene } from 'pixifact/compiler';

                @scene()
                export class Button extends Container {}
            `);
            await writeFile(join(root, 'src', 'screens', 'Main.scene'), `
                <Scene name="Main">
                  <Button id="uiButton" scene="../ui/Button.scene" label="Primary" />
                  <Button id="menuButton" scene="../menu/Button.scene" />
                </Scene>
            `);
            await writeFile(join(root, 'src', 'screens', 'Main.ts'), `
                import { Container } from 'pixi.js';
                import { scene } from 'pixifact/compiler';

                @scene()
                export class Main extends Container {}
            `);
            await writeFile(join(root, 'src', 'build', 'BuildOnly.scene'), '<Scene name="BuildOnly" />');
            await writeFile(join(root, 'src', 'generated', 'GeneratedOnly.scene'), '<Scene name="GeneratedOnly" />');

            await compileScenes({ projectRoot: root });

            const uiGenerated = await readFile(join(root, '.pixifact', 'generated', 'src', 'ui', 'Button.scene.generated.ts'), 'utf8');
            const menuGenerated = await readFile(join(root, '.pixifact', 'generated', 'src', 'menu', 'Button.scene.generated.ts'), 'utf8');
            const mainGenerated = await readFile(join(root, '.pixifact', 'generated', 'src', 'screens', 'Main.scene.generated.ts'), 'utf8');
            const registry = await readFile(join(root, '.pixifact', 'generated', 'scenes.generated.ts'), 'utf8');

            expect(uiGenerated).toContain('registerScene("src/ui/Button.scene"');
            expect(uiGenerated).toContain('registerSceneClass(SceneClass_src_ui_Button, "src/ui/Button.scene");');
            expect(uiGenerated).toContain('import { Button as SceneClass_src_ui_Button } from "../../../../src/ui/Button";');
            expect(uiGenerated).toContain('import __pixifactTextureUrl1 from "../../../../src/assets/btn.png?url";');
            expect(uiGenerated).not.toContain('from "../../../src/ui/Button";');
            expect(uiGenerated).not.toContain('from "../../../src/assets/btn.png?url";');
            expect(menuGenerated).toContain('registerScene("src/menu/Button.scene"');
            expect(menuGenerated).toContain('import { Button as SceneClass_src_menu_Button } from "../../../../src/menu/Button";');
            expect(menuGenerated).not.toContain('from "../../../src/menu/Button";');
            expect(mainGenerated).toContain('import { Button as SceneClass_src_menu_Button } from "../../../../src/menu/Button";');
            expect(mainGenerated).toContain('import { Button as SceneClass_src_ui_Button } from "../../../../src/ui/Button";');
            expect(mainGenerated).toContain('const uiButton = new SceneClass_src_ui_Button();');
            expect(mainGenerated).toContain('const menuButton = new SceneClass_src_menu_Button();');
            expect(registry).toContain('import "./src/ui/Button.scene.generated";');
            expect(registry).toContain('import "./src/menu/Button.scene.generated";');
            expect(registry).toContain('import "./src/screens/Main.scene.generated";');
            expect(registry).not.toContain('BuildOnly');
            expect(registry).not.toContain('GeneratedOnly');
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it('generates built-in Scene modules when project scenes use built-in tags', async () => {
        const root = await mkdtemp(join(tmpdir(), 'pixifact-scenes-'));
        try {
            await mkdir(join(root, 'src', 'scenes'), { recursive: true });
            await writeFile(join(root, 'src', 'scenes', 'Main.scene'), `
                <Scene name="Main">
                  <VBoxContainer id="menuStack" gap="10">
                    <Text id="label" text="Play" />
                  </VBoxContainer>
                </Scene>
            `);
            await writeFile(join(root, 'src', 'scenes', 'Main.ts'), `
                import { Container } from 'pixi.js';
                import { scene } from 'pixifact/compiler';

                @scene()
                export class Main extends Container {}
            `);

            await compileScenes({ projectRoot: root });

            const mainGenerated = await readFile(join(root, '.pixifact', 'generated', 'src', 'scenes', 'Main.scene.generated.ts'), 'utf8');
            const builtinGenerated = await readFile(join(root, '.pixifact', 'generated', 'pixifact-builtin', 'VBoxContainer.scene.generated.ts'), 'utf8');
            const registry = await readFile(join(root, '.pixifact', 'generated', 'scenes.generated.ts'), 'utf8');

            expect(mainGenerated).toContain('import { VBoxContainer as BuiltinSceneClass_VBoxContainer }');
            expect(mainGenerated).toContain('const menuStack = new BuiltinSceneClass_VBoxContainer();');
            expect(mainGenerated).toContain('menuStack.gap = 10;');
            expect(mainGenerated).toContain('mount(menuStack, label, "default");');
            expect(builtinGenerated).toContain('registerScene("pixifact:VBoxContainer.scene"');
            expect(builtinGenerated).toContain('registerSceneClass(BuiltinSceneClass_VBoxContainer, "pixifact:VBoxContainer.scene");');
            expect(registry).toContain('import "./pixifact-builtin/VBoxContainer.scene.generated";');
            expect(registry).toContain('import "./src/scenes/Main.scene.generated";');
            expect(registry.indexOf('pixifact-builtin/VBoxContainer')).toBeLessThan(registry.indexOf('src/scenes/Main'));
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it('keeps explicit project Scene references ahead of built-in Scene names', async () => {
        const root = await mkdtemp(join(tmpdir(), 'pixifact-scenes-'));
        try {
            await mkdir(join(root, 'src', 'scenes'), { recursive: true });
            await writeFile(join(root, 'src', 'scenes', 'VBoxContainer.scene'), '<Scene name="VBoxContainer" />');
            await writeFile(join(root, 'src', 'scenes', 'VBoxContainer.ts'), `
                import { Container } from 'pixi.js';
                import { scene } from 'pixifact/compiler';

                @scene()
                export class VBoxContainer extends Container {}
            `);
            await writeFile(join(root, 'src', 'scenes', 'Main.scene'), `
                <Scene name="Main">
                  <VBoxContainer id="menuStack" scene="./VBoxContainer.scene" />
                </Scene>
            `);
            await writeFile(join(root, 'src', 'scenes', 'Main.ts'), `
                import { Container } from 'pixi.js';
                import { scene } from 'pixifact/compiler';

                @scene()
                export class Main extends Container {}
            `);

            await compileScenes({ projectRoot: root });

            const mainGenerated = await readFile(join(root, '.pixifact', 'generated', 'src', 'scenes', 'Main.scene.generated.ts'), 'utf8');
            const registry = await readFile(join(root, '.pixifact', 'generated', 'scenes.generated.ts'), 'utf8');

            expect(mainGenerated).toContain('import { VBoxContainer as SceneClass_src_scenes_VBoxContainer }');
            expect(mainGenerated).toContain('const menuStack = new SceneClass_src_scenes_VBoxContainer();');
            expect(mainGenerated).not.toContain('BuiltinSceneClass_VBoxContainer');
            expect(registry).toContain('import "./src/scenes/VBoxContainer.scene.generated";');
            expect(registry).not.toContain('import "./pixifact-builtin/VBoxContainer.scene.generated";');
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it('rejects missing paired scripts and mismatched local names', async () => {
        const root = await mkdtemp(join(tmpdir(), 'pixifact-scenes-'));
        try {
            await mkdir(join(root, 'src', 'ui'), { recursive: true });
            await writeFile(join(root, 'src', 'ui', 'Button.scene'), '<Scene name="PrimaryButton" />');

            await expect(compileScenes({ projectRoot: root }))
                .rejects.toThrow('Scene "src/ui/Button.scene" name "PrimaryButton" must match file basename "Button".');

            await writeFile(join(root, 'src', 'ui', 'Button.scene'), '<Scene name="Button" />');
            await expect(compileScenes({ projectRoot: root }))
                .rejects.toThrow('Scene "src/ui/Button.scene" requires paired script "src/ui/Button.ts".');
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

    it('rejects scene files whose name does not match the paired @scene class', async () => {
        const root = await mkdtemp(join(tmpdir(), 'pixifact-scenes-'));
        try {
            await mkdir(join(root, 'src', 'scenes'), { recursive: true });
            await writeFile(join(root, 'src', 'scenes', 'Button.scene'), '<Scene name="Button" />');
            await writeFile(join(root, 'src', 'scenes', 'Button.ts'), `
                import { Container } from 'pixi.js';
                import { scene } from 'pixifact/compiler';

                @scene()
                export class PrimaryButton extends Container {}
            `);

            await expect(compileScenes({ projectRoot: root })).rejects.toThrow('Scene "src/scenes/Button.scene" name "Button" must match @scene class "PrimaryButton".');
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it('rejects paired script parts that do not exist in the scene template', async () => {
        const root = await mkdtemp(join(tmpdir(), 'pixifact-scenes-'));
        try {
            await mkdir(join(root, 'src', 'scenes'), { recursive: true });
            await writeFile(join(root, 'src', 'scenes', 'Button.scene'), [
                '<Scene name="Button">',
                '  <Text id="label" text="Start" />',
                '</Scene>',
                '',
            ].join('\n'));
            await writeFile(join(root, 'src', 'scenes', 'Button.ts'), `
                import { Container, Text } from 'pixi.js';
                import { part, scene } from 'pixifact/compiler';

                @scene()
                export class Button extends Container {
                    @part({ id: 'missingLabel' })
                    protected declare label: Text;
                }
            `);

            await expect(compileScenes({ projectRoot: root }))
                .rejects.toThrow('Scene "src/scenes/Button.scene" @part "label" references missing node id "missingLabel".');
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
