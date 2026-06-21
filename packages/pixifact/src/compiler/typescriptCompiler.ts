import type {
    CompileSceneTemplateOptions,
    PixiTemplateNode,
    SceneInstanceTemplateNode,
    SceneTemplate,
    SceneTemplateNode,
    SceneTemplatePrimitiveType,
    SceneTemplateStructPropContract,
    SceneTemplateValue,
} from './spec';
import {
    pixiSceneDisplayProps,
    pixiSceneGraphicsProps,
    pixiSceneLayoutProps,
    pixiSceneRectProps,
    pixiSceneSpriteLikeProps,
    pixiSceneTextStyleProps,
    pixiSceneTransformProps,
} from './pixiNodeSchema';

const transformProps = new Set<string>(pixiSceneTransformProps);
const layoutProps = new Set<string>(pixiSceneLayoutProps);
const pixiProps = new Set<string>(pixiSceneDisplayProps);
const spriteProps = new Set<string>(pixiSceneSpriteLikeProps);
const graphicsProps = new Set<string>(pixiSceneGraphicsProps);
const rectProps = new Set<string>(pixiSceneRectProps);
const textStyleProps = new Set<string>(pixiSceneTextStyleProps);
const runtimeNodeTypes = new Set<SceneTemplatePrimitiveType>(['HBoxContainer', 'VBoxContainer', 'Rect']);
const runtimeNodeProps = new Set<string>(['gap', 'alignX', 'alignY', 'justify']);

export function compileSceneTemplateToTs(template: SceneTemplate, options: CompileSceneTemplateOptions = {}) {
    const context = new CompileContext(template, options);
    return context.compile();
}

class CompileContext {
    readonly #imports = new Set<SceneTemplatePrimitiveType>();
    readonly #pixiImports = new Set<string>();
    readonly #pixiRuntimeImports = new Set<string>();
    readonly #runtimeImports = new Set<string>();
    readonly #lines: string[] = [];
    readonly #parts: { id: string; type: string }[] = [];
    readonly #textures = new Map<string, string>();
    #nextId = 0;
    #nextTextureId = 0;

    constructor(
        private readonly template: SceneTemplate,
        private readonly options: CompileSceneTemplateOptions,
    ) {}

    compile() {
        for (const child of this.template.children) {
            this.#collectImports(child);
            this.#collectParts(child);
            this.#collectTextures(child);
        }

        const functionName = this.options.functionName || `mount${this.template.name}Scene`;
        const actionsParameter = this.options.actionsParameter || 'actions';
        const partsType = this.#formatPartsType();
        const textureLoads = this.#formatTextureLoads();

        this.#lines.push(`export function ${functionName}(root: Group${this.#hasEvents() ? `, ${actionsParameter}: Record<string, () => void> = {}` : ''}) {`);
        this.#lines.push('  const __pixifactSlots: Record<string, Container> = {};');
        this.#applyRootProps();
        for (const child of this.template.children) {
            this.#compileNode(child, 'root', actionsParameter);
        }
        this.#lines.push('  return {');
        this.#lines.push('    root,');
        this.#lines.push(`    parts: { ${this.#parts.map((part) => part.id).join(', ')} },`);
        this.#lines.push('    slots: __pixifactSlots,');
        this.#lines.push('  };');
        this.#lines.push('}');
        if (this.options.registrationPath) {
            this.#runtimeImports.add('registerScene');
            if (this.options.scriptImport) {
                this.#runtimeImports.add('registerSceneClass');
            }
            this.#lines.push('');
            this.#lines.push(`registerScene(${JSON.stringify(this.options.registrationPath)}, {`);
            this.#lines.push(`  mount: ${functionName},`);
            this.#lines.push('});');
            if (this.options.scriptImport) {
                this.#lines.push(`registerSceneClass(${this.options.scriptImport.localName}, ${JSON.stringify(this.options.registrationPath)});`);
            }
        }

        const imports = this.#formatImports();
        return [
            imports,
            textureLoads,
            partsType,
            this.#lines.join('\n'),
        ].filter(Boolean).join('\n\n') + '\n';
    }

    #formatImports() {
        const imports = [...new Set([
            'Container',
            ...[...this.#imports].filter((item) => item !== 'Container').sort(),
            ...[...this.#pixiImports].sort(),
        ])];
        const runtimeImports = ['Group', ...[...this.#pixiRuntimeImports].sort()];
        const lines = [`import { ${imports.join(', ')} } from 'pixi.js';`, `import { ${runtimeImports.join(', ')} } from 'pixifact/runtime';`];
        for (const [texture, variable] of this.#textureImportEntries()) {
            lines.push(`import ${variable} from ${JSON.stringify(this.options.textureImports?.[texture])};`);
        }
        for (const sceneImport of this.options.sceneImports ?? []) {
            const classImport = sceneImport.exportName === sceneImport.localName
                ? sceneImport.exportName
                : `${sceneImport.exportName} as ${sceneImport.localName}`;
            const imports = [
                ...(this.#usesSceneClassImport(sceneImport) ? [classImport] : []),
                ...this.#sceneStructImports(sceneImport),
            ];
            if (imports.length > 0) {
                lines.push(`import { ${imports.join(', ')} } from ${JSON.stringify(sceneImport.source)};`);
            }
        }
        if (this.options.scriptImport) {
            lines.push(`import { ${this.options.scriptImport.exportName} as ${this.options.scriptImport.localName} } from ${JSON.stringify(this.options.scriptImport.source)};`);
        }
        if (this.#runtimeImports.size > 0) {
            lines.push(`import { ${[...this.#runtimeImports].sort().join(', ')} } from 'pixifact/compiler';`);
        }
        return lines.join('\n');
    }

    #formatPartsType() {
        const lines = [`export type ${this.template.name}Parts = {`, '  root: Group;'];
        lines.push('  parts: {');
        for (const part of this.#parts) {
            lines.push(`    ${part.id}: ${part.type};`);
        }
        lines.push('  };');
        lines.push('  slots: Record<string, Container>;');
        lines.push('};');
        return lines.join('\n');
    }

    #collectImports(node: SceneTemplateNode) {
        if (node.kind === 'pixi') {
            if (runtimeNodeTypes.has(node.type)) {
                this.#pixiRuntimeImports.add(node.type);
            } else {
                this.#imports.add(node.type);
            }
            for (const child of node.children) {
                this.#collectImports(child);
            }
            return;
        }
        if (node.kind === 'sceneInstance') {
            for (const children of Object.values(node.slots)) {
                for (const child of children) {
                    this.#collectImports(child);
                }
            }
        }
    }

    #collectParts(node: SceneTemplateNode) {
        if (node.kind === 'pixi') {
            if (node.id) {
                this.#parts.push({ id: node.id, type: node.type });
            }
            for (const child of node.children) {
                this.#collectParts(child);
            }
            return;
        }
        if (node.kind === 'sceneInstance') {
            if (node.id) {
                this.#parts.push({ id: node.id, type: this.#sceneConstructorName(node) });
            }
            for (const children of Object.values(node.slots)) {
                for (const child of children) {
                    this.#collectParts(child);
                }
            }
        }
    }

    #collectTextures(node: SceneTemplateNode) {
        if (node.kind === 'slotOutlet') {
            return;
        }
        if (node.kind === 'pixi') {
            if (typeof node.props.texture === 'string') {
                this.#textureVariable(node.props.texture);
            }
            for (const child of node.children) {
                this.#collectTextures(child);
            }
            return;
        }
        for (const children of Object.values(node.slots)) {
            for (const child of children) {
                this.#collectTextures(child);
            }
        }
    }

    #formatTextureLoads() {
        if (this.#textures.size === 0) {
            return '';
        }
        this.#pixiImports.add('Assets');
        return [...this.#textures.entries()]
            .map(([texture, variable]) => `const ${variable} = await Assets.load(${this.#textureLoadSource(texture)});`)
            .join('\n');
    }

    #compileNode(node: SceneTemplateNode, parent: string, actionsParameter: string) {
        if (node.kind === 'slotOutlet') {
            this.#runtimeImports.add('registerSlot');
            this.#lines.push(`  __pixifactSlots[${JSON.stringify(node.name)}] = ${parent};`);
            this.#lines.push(`  registerSlot(root, ${JSON.stringify(node.name)}, ${parent});`);
            return;
        }
        if (node.kind === 'sceneInstance') {
            this.#compileSceneInstance(node, parent, actionsParameter);
            return;
        }
        this.#compilePixiNode(node, parent, actionsParameter);
    }

    #compilePixiNode(node: PixiTemplateNode, parent: string, actionsParameter: string) {
        const variable = node.id || this.#anonymousName(node.type);
        this.#lines.push(`  const ${variable} = ${this.#constructPixiNode(node)};`);
        this.#applyNodeId(variable, node.id);
        this.#applyPixiProps(variable, node.props, false, undefined, node.type);
        this.#applyParentSorting(parent, node.props);
        this.#lines.push(`  ${parent}.addChild(${variable});`);
        for (const child of node.children) {
            this.#compileNode(child, variable, actionsParameter);
        }
    }

    #compileSceneInstance(node: SceneInstanceTemplateNode, parent: string, actionsParameter: string) {
        const variable = node.id || this.#anonymousName(node.type);
        const constructorName = this.#sceneConstructorName(node);
        this.#lines.push(`  const ${variable} = new ${constructorName}();`);
        this.#applyPixiProps(variable, node.props, true, node);
        for (const [name, action] of Object.entries(node.events)) {
            this.#runtimeImports.add('connectSceneEvent');
            this.#lines.push(`  connectSceneEvent(${variable}.${name}, ${JSON.stringify(action)}, root, ${actionsParameter});`);
        }
        this.#applyParentSorting(parent, node.props);
        this.#lines.push(`  ${parent}.addChild(${variable});`);
        for (const [slot, children] of Object.entries(node.slots)) {
            for (const child of children) {
                const childVariable = this.#compileSlottedNode(child, variable, actionsParameter);
                this.#runtimeImports.add('mount');
                this.#lines.push(`  mount(${variable}, ${childVariable}, ${JSON.stringify(slot)});`);
            }
        }
    }

    #compileSlottedNode(node: SceneTemplateNode, slotTarget: string, actionsParameter: string) {
        if (node.kind === 'slotOutlet') {
            throw new Error(`Cannot place <slot> inside ${slotTarget}.`);
        }
        if (node.kind === 'sceneInstance') {
            const variable = node.id || this.#anonymousName(node.type);
            const constructorName = this.#sceneConstructorName(node);
            this.#lines.push(`  const ${variable} = new ${constructorName}();`);
            this.#applyPixiProps(variable, node.props, true, node);
            for (const [name, action] of Object.entries(node.events)) {
                this.#runtimeImports.add('connectSceneEvent');
                this.#lines.push(`  connectSceneEvent(${variable}.${name}, ${JSON.stringify(action)}, root, ${actionsParameter});`);
            }
            for (const [slot, children] of Object.entries(node.slots)) {
                for (const child of children) {
                    const childVariable = this.#compileSlottedNode(child, variable, actionsParameter);
                    this.#runtimeImports.add('mount');
                    this.#lines.push(`  mount(${variable}, ${childVariable}, ${JSON.stringify(slot)});`);
                }
            }
            return variable;
        }

        const variable = node.id || this.#anonymousName(node.type);
        this.#lines.push(`  const ${variable} = ${this.#constructPixiNode(node)};`);
        this.#applyNodeId(variable, node.id);
        this.#applyPixiProps(variable, node.props, false, undefined, node.type);
        for (const child of node.children) {
            this.#compileNode(child, variable, actionsParameter);
        }
        return variable;
    }

    #constructPixiNode(node: PixiTemplateNode) {
        if (node.type === 'Text' || node.type === 'BitmapText' || node.type === 'HTMLText') {
            const text = this.#stringValue(node.props.text ?? '');
            const style = this.#styleObject(node.props);
            return `new ${node.type}({ text: ${text}${style ? `, style: ${style}` : ''} })`;
        }
        if (node.type === 'Sprite') {
            return node.props.texture === undefined
                ? 'new Sprite()'
                : `new Sprite({ texture: ${this.#textureValue(node.props.texture)} })`;
        }
        if (node.type === 'NineSliceSprite') {
            return `new NineSliceSprite(${this.#spriteTextureOptions(node.props)})`;
        }
        if (node.type === 'TilingSprite') {
            return `new TilingSprite(${this.#spriteTextureOptions(node.props)})`;
        }
        if (node.type === 'Graphics') {
            return 'new Graphics()';
        }
        return `new ${node.type}()`;
    }

    #sceneConstructorName(node: SceneInstanceTemplateNode) {
        return this.options.sceneClassAliases?.[node.scene] ?? node.type;
    }

    #sceneStructImports(sceneImport: NonNullable<CompileSceneTemplateOptions['sceneImports']>[number]) {
        const scene = this.#sceneImportScene(sceneImport);
        if (!scene) {
            return [];
        }
        const structs = new Set<string>();
        this.#collectSceneStructImports(this.template.children, scene, structs);
        return [...structs].sort();
    }

    #collectSceneStructImports(nodes: readonly SceneTemplateNode[], sourceScene: string, structs: Set<string>) {
        for (const node of nodes) {
            if (node.kind === 'slotOutlet') {
                continue;
            }
            if (node.kind === 'pixi') {
                this.#collectSceneStructImports(node.children, sourceScene, structs);
                continue;
            }
            const sceneInterface = this.options.sceneInterfaces?.[node.scene];
            for (const [key, value] of Object.entries(node.props)) {
                const contract = value && typeof value === 'object' ? sceneInterface?.props[key] : undefined;
                if (contract?.type === 'struct' && this.#structContractSourceScene(node.scene, contract) === sourceScene) {
                    structs.add(contract.struct);
                }
            }
            for (const children of Object.values(node.slots)) {
                this.#collectSceneStructImports(children, sourceScene, structs);
            }
        }
    }

    #usesSceneClassImport(sceneImport: NonNullable<CompileSceneTemplateOptions['sceneImports']>[number]) {
        const scene = this.#sceneImportScene(sceneImport);
        if (!scene) {
            return true;
        }
        const instanceScenes = this.#sceneInstanceScenes();
        if (instanceScenes.has(scene)) {
            return true;
        }
        return Object.entries(this.options.sceneClassAliases ?? {})
            .some(([instanceScene, alias]) => alias === sceneImport.localName && instanceScenes.has(instanceScene));
    }

    #sceneInstanceScenes() {
        const scenes = new Set<string>();
        this.#collectSceneInstanceScenes(this.template.children, scenes);
        return scenes;
    }

    #collectSceneInstanceScenes(nodes: readonly SceneTemplateNode[], scenes: Set<string>) {
        for (const node of nodes) {
            if (node.kind === 'slotOutlet') {
                continue;
            }
            if (node.kind === 'pixi') {
                this.#collectSceneInstanceScenes(node.children, scenes);
                continue;
            }
            scenes.add(node.scene);
            for (const children of Object.values(node.slots)) {
                this.#collectSceneInstanceScenes(children, scenes);
            }
        }
    }

    #sceneImportScene(sceneImport: NonNullable<CompileSceneTemplateOptions['sceneImports']>[number]) {
        return sceneImport.scene
            ?? Object.entries(this.options.sceneClassAliases ?? {}).find(([, alias]) => alias === sceneImport.localName)?.[0];
    }

    #structContractSourceScene(instanceScene: string, contract: SceneTemplateStructPropContract) {
        return contract.sourceScene ?? instanceScene;
    }

    #applyPixiProps(
        variable: string,
        props: Record<string, SceneTemplateValue>,
        instance = false,
        sceneInstance?: SceneInstanceTemplateNode,
        pixiType?: SceneTemplatePrimitiveType,
    ) {
        const x = props.x;
        const y = props.y;
        if (x !== undefined || y !== undefined) {
            this.#lines.push(`  ${variable}.position.set(${this.#value(x ?? 0)}, ${this.#value(y ?? 0)});`);
        }
        if (props.width !== undefined && props.shape === undefined) {
            this.#lines.push(`  ${variable}.width = ${this.#value(props.width)};`);
        }
        if (props.height !== undefined && props.shape === undefined) {
            this.#lines.push(`  ${variable}.height = ${this.#value(props.height)};`);
        }
        this.#applyLayoutProps(variable, props);
        const scaleX = props.scaleX;
        const scaleY = props.scaleY;
        if (scaleX !== undefined || scaleY !== undefined) {
            this.#lines.push(`  ${variable}.scale.set(${this.#value(scaleX ?? 1)}, ${this.#value(scaleY ?? 1)});`);
        }
        if (props.rotation !== undefined) {
            this.#lines.push(`  ${variable}.rotation = ${this.#value(props.rotation)};`);
        }
        const pivotX = props.pivotX;
        const pivotY = props.pivotY;
        if (pivotX !== undefined || pivotY !== undefined) {
            this.#lines.push(`  ${variable}.pivot.set(${this.#value(pivotX ?? 0)}, ${this.#value(pivotY ?? 0)});`);
        }
        const skewX = props.skewX;
        const skewY = props.skewY;
        if (skewX !== undefined || skewY !== undefined) {
            this.#lines.push(`  ${variable}.skew.set(${this.#value(skewX ?? 0)}, ${this.#value(skewY ?? 0)});`);
        }
        this.#applySpriteProps(variable, props);
        if (!instance && props.shape !== undefined) {
            this.#drawGraphics(variable, props);
        }
        for (const [key, value] of Object.entries(props)) {
            if (!instance && runtimeNodeProps.has(key)) {
                this.#lines.push(`  ${variable}.${key} = ${this.#value(value)};`);
                continue;
            }
            if (!instance && pixiType === 'Rect' && this.#isRectProp(key)) {
                this.#lines.push(`  ${variable}.${key} = ${this.#value(value)};`);
                continue;
            }
            const nativePixiNodeProp = transformProps.has(key)
                || layoutProps.has(key)
                || spriteProps.has(key)
                || graphicsProps.has(key)
                || key === 'text'
                || this.#isTextStyleProp(key);
            if (!instance && nativePixiNodeProp) {
                continue;
            }
            if (instance && transformProps.has(key)) {
                continue;
            }
            if (instance && layoutProps.has(key)) {
                continue;
            }
            if (instance && value && typeof value === 'object') {
                this.#applyStructProp(variable, key, value, sceneInstance);
                continue;
            }
            if (instance || pixiProps.has(key)) {
                this.#lines.push(`  ${variable}.${key} = ${this.#value(value)};`);
            }
        }
    }

    #applyRootProps() {
        const props = { ...this.template.props };
        const hasExplicitSize = props.width !== undefined || props.height !== undefined;
        const width = hasExplicitSize ? props.width : this.options.defaultRootSize?.width;
        const height = hasExplicitSize ? props.height : this.options.defaultRootSize?.height;
        delete props.width;
        delete props.height;
        if (width !== undefined || height !== undefined) {
            this.#lines.push(`  root.setSize(${this.#value(width ?? 0)}, ${this.#value(height ?? 0)});`);
        }
        this.#applyPixiProps('root', props);
    }

    #applyLayoutProps(variable: string, props: Record<string, SceneTemplateValue>) {
        const entries = pixiSceneLayoutProps.flatMap((key) => {
            const value = props[key];
            return value === undefined ? [] : [`${key}: ${this.#value(value)}`];
        });
        if (entries.length === 0) {
            return;
        }
        this.#pixiRuntimeImports.add('setFrameLayout');
        this.#lines.push(`  setFrameLayout(${variable}, { ${entries.join(', ')} });`);
    }

    #applyStructProp(variable: string, key: string, value: Record<string, string | number | boolean>, sceneInstance?: SceneInstanceTemplateNode) {
        const contract = this.#sceneInstanceStructContract(sceneInstance, key);
        if (!contract) {
            this.#lines.push(`  ${variable}.${key} = ${this.#value(value)};`);
            return;
        }
        const structVariable = `${variable}${key.charAt(0).toUpperCase()}${key.slice(1)}`;
        this.#lines.push(`  const ${structVariable} = new ${contract.struct}();`);
        for (const [field, fieldValue] of Object.entries(value)) {
            this.#lines.push(`  ${structVariable}.${field} = ${this.#value(fieldValue)};`);
        }
        this.#lines.push(`  ${variable}.${key} = ${structVariable};`);
    }

    #sceneInstanceStructContract(sceneInstance: SceneInstanceTemplateNode | undefined, key: string) {
        const contract = sceneInstance ? this.options.sceneInterfaces?.[sceneInstance.scene]?.props[key] : undefined;
        return contract?.type === 'struct' ? contract : undefined;
    }

    #applySpriteProps(variable: string, props: Record<string, SceneTemplateValue>) {
        const anchorX = props.anchorX;
        const anchorY = props.anchorY;
        if (anchorX !== undefined || anchorY !== undefined) {
            this.#lines.push(`  ${variable}.anchor.set(${this.#value(anchorX ?? 0)}, ${this.#value(anchorY ?? 0)});`);
        }
        if (props.tint !== undefined) {
            this.#lines.push(`  ${variable}.tint = ${this.#value(props.tint)};`);
        }
        for (const key of ['leftWidth', 'rightWidth', 'topHeight', 'bottomHeight', 'tileRotation']) {
            const value = props[key];
            if (value !== undefined) {
                this.#lines.push(`  ${variable}.${key} = ${this.#value(value)};`);
            }
        }
        const tilePositionX = props.tilePositionX;
        const tilePositionY = props.tilePositionY;
        if (tilePositionX !== undefined || tilePositionY !== undefined) {
            this.#lines.push(`  ${variable}.tilePosition.set(${this.#value(tilePositionX ?? 0)}, ${this.#value(tilePositionY ?? 0)});`);
        }
        const tileScaleX = props.tileScaleX;
        const tileScaleY = props.tileScaleY;
        if (tileScaleX !== undefined || tileScaleY !== undefined) {
            this.#lines.push(`  ${variable}.tileScale.set(${this.#value(tileScaleX ?? 1)}, ${this.#value(tileScaleY ?? 1)});`);
        }
    }

    #drawGraphics(variable: string, props: Record<string, SceneTemplateValue>) {
        const shape = props.shape;
        if (shape === 'roundRect') {
            this.#lines.push(`  ${variable}.roundRect(0, 0, ${this.#value(props.width ?? 0)}, ${this.#value(props.height ?? 0)}, ${this.#value(props.radius ?? 0)})${this.#graphicsStyles(props)};`);
            return;
        }
        if (shape === 'rect') {
            this.#lines.push(`  ${variable}.rect(0, 0, ${this.#value(props.width ?? 0)}, ${this.#value(props.height ?? 0)})${this.#graphicsStyles(props)};`);
        }
    }

    #graphicsStyles(props: Record<string, SceneTemplateValue>) {
        const fill = props.fillAlpha === undefined
            ? `.fill(${this.#value(props.fill ?? 0xffffff)})`
            : `.fill({ color: ${this.#value(props.fill ?? 0xffffff)}, alpha: ${this.#value(props.fillAlpha)} })`;
        if (props.strokeWidth === undefined) {
            return fill;
        }
        const stroke = props.strokeAlpha === undefined
            ? `.stroke({ width: ${this.#value(props.strokeWidth)}, color: ${this.#value(props.strokeColor ?? 0x000000)} })`
            : `.stroke({ width: ${this.#value(props.strokeWidth)}, color: ${this.#value(props.strokeColor ?? 0x000000)}, alpha: ${this.#value(props.strokeAlpha)} })`;
        return `${fill}${stroke}`;
    }

    #applyNodeId(variable: string, id: string | undefined) {
        if (id) {
            this.#lines.push(`  ${variable}.label = ${JSON.stringify(id)};`);
        }
    }

    #applyParentSorting(parent: string, props: Record<string, SceneTemplateValue>) {
        if (props.zIndex !== undefined) {
            this.#lines.push(`  ${parent}.sortableChildren = true;`);
        }
    }

    #styleObject(props: Record<string, SceneTemplateValue>) {
        const entries: string[] = [];
        for (const key of pixiSceneTextStyleProps) {
            const value = props[key];
            if (value !== undefined) {
                entries.push(`${key}: ${key === 'fontWeight' ? JSON.stringify(String(value)) : this.#value(value)}`);
            }
        }
        return entries.length > 0 ? `{ ${entries.join(', ')} }` : undefined;
    }

    #spriteTextureOptions(props: Record<string, SceneTemplateValue>) {
        return props.texture === undefined
            ? '{}'
            : `{ texture: ${this.#textureValue(props.texture)} }`;
    }

    #hasEvents() {
        for (const child of this.template.children) {
            if (this.#nodeHasEvents(child)) {
                return true;
            }
        }
        return false;
    }

    #nodeHasEvents(node: SceneTemplateNode): boolean {
        if (node.kind === 'slotOutlet') {
            return false;
        }
        if (node.kind === 'sceneInstance') {
            if (Object.keys(node.events).length > 0) {
                return true;
            }
            return Object.values(node.slots).some((children) => children.some((child) => this.#nodeHasEvents(child)));
        }
        return node.children.some((child) => this.#nodeHasEvents(child));
    }

    #isTextStyleProp(key: string) {
        return textStyleProps.has(key);
    }

    #isRectProp(key: string) {
        return rectProps.has(key);
    }

    #anonymousName(type: string) {
        this.#nextId += 1;
        return `${type.charAt(0).toLowerCase()}${type.slice(1)}${this.#nextId}`;
    }

    #textureVariable(texture: string) {
        const existing = this.#textures.get(texture);
        if (existing) {
            return existing;
        }
        this.#nextTextureId += 1;
        const variable = `__pixifactTexture${this.#nextTextureId}`;
        this.#textures.set(texture, variable);
        return variable;
    }

    #textureImportEntries() {
        return [...this.#textures.keys()]
            .filter((texture) => this.options.textureImports?.[texture])
            .map((texture, index) => [texture, `__pixifactTextureUrl${index + 1}`] as const);
    }

    #textureImportVariable(texture: string) {
        const index = [...this.#textures.keys()]
            .filter((key) => this.options.textureImports?.[key])
            .indexOf(texture);
        return index >= 0 ? `__pixifactTextureUrl${index + 1}` : undefined;
    }

    #textureLoadSource(texture: string) {
        return this.#textureImportVariable(texture) ?? this.#value(texture);
    }

    #textureValue(value: SceneTemplateValue) {
        return typeof value === 'string' ? this.#textureVariable(value) : this.#value(value);
    }

    #value(value: SceneTemplateValue): string {
        if (typeof value === 'string') {
            return JSON.stringify(value);
        }
        if (value && typeof value === 'object') {
            return `{ ${Object.entries(value).map(([key, fieldValue]) => `${key}: ${this.#scalarValue(fieldValue)}`).join(', ')} }`;
        }
        return String(value);
    }

    #scalarValue(value: string | number | boolean): string {
        return typeof value === 'string' ? JSON.stringify(value) : String(value);
    }

    #stringValue(value: SceneTemplateValue): string {
        return JSON.stringify(String(value));
    }
}
