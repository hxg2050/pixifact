import type {
    CompileSceneTemplateOptions,
    PixiTemplateNode,
    SceneInstanceTemplateNode,
    SceneTemplate,
    SceneTemplateNode,
    SceneTemplatePrimitiveType,
    SceneTemplateValue,
} from './spec';

const transformProps = new Set(['x', 'y', 'width', 'height']);
const pixiProps = new Set(['alpha', 'visible', 'eventMode', 'cursor', 'label']);

export function compileSceneTemplateToTs(template: SceneTemplate, options: CompileSceneTemplateOptions = {}) {
    const context = new CompileContext(template, options);
    return context.compile();
}

class CompileContext {
    readonly #imports = new Set<SceneTemplatePrimitiveType>();
    readonly #runtimeImports = new Set<string>();
    readonly #lines: string[] = [];
    readonly #parts: { id: string; type: string }[] = [];
    #nextId = 0;

    constructor(
        private readonly template: SceneTemplate,
        private readonly options: CompileSceneTemplateOptions,
    ) {}

    compile() {
        for (const child of this.template.children) {
            this.#collectImports(child);
            this.#collectParts(child);
        }

        const functionName = this.options.functionName || `mount${this.template.name}Scene`;
        const actionsParameter = this.options.actionsParameter || 'actions';
        const partsType = this.#formatPartsType();

        this.#lines.push(`export function ${functionName}(root: Container${this.#hasEvents() ? `, ${actionsParameter}: Record<string, () => void> = {}` : ''}) {`);
        this.#lines.push('  const __pixifactSlots: Record<string, Container> = {};');
        this.#applyPixiProps('root', this.template.props);
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
            this.#lines.push('');
            this.#lines.push(`registerScene(${JSON.stringify(this.options.registrationPath)}, {`);
            this.#lines.push(`  mount: ${functionName},`);
            this.#lines.push('});');
        }

        const imports = this.#formatImports();
        return `${imports}\n\n${partsType}\n\n${this.#lines.join('\n')}\n`;
    }

    #formatImports() {
        const imports = ['Container', ...[...this.#imports].filter((item) => item !== 'Container').sort()];
        const lines = [`import { ${imports.join(', ')} } from 'pixi.js';`];
        for (const [name, source] of Object.entries(this.options.sceneImports ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
            lines.push(`import { ${name} } from ${JSON.stringify(source)};`);
        }
        if (this.#runtimeImports.size > 0) {
            lines.push(`import { ${[...this.#runtimeImports].sort().join(', ')} } from 'pixifact/compiler';`);
        }
        return lines.join('\n');
    }

    #formatPartsType() {
        const lines = [`export type ${this.template.name}Parts = {`, '  root: Container;'];
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
            this.#imports.add(node.type);
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
                this.#parts.push({ id: node.id, type: node.type });
            }
            for (const children of Object.values(node.slots)) {
                for (const child of children) {
                    this.#collectParts(child);
                }
            }
        }
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
        this.#applyPixiProps(variable, node.props);
        this.#lines.push(`  ${parent}.addChild(${variable});`);
        for (const child of node.children) {
            this.#compileNode(child, variable, actionsParameter);
        }
    }

    #compileSceneInstance(node: SceneInstanceTemplateNode, parent: string, actionsParameter: string) {
        const variable = node.id || this.#anonymousName(node.type);
        this.#lines.push(`  const ${variable} = new ${node.type}();`);
        this.#applyPixiProps(variable, node.props, true);
        for (const [name, action] of Object.entries(node.events)) {
            this.#runtimeImports.add('connectSceneEvent');
            this.#lines.push(`  connectSceneEvent(${variable}.${name}, ${JSON.stringify(action)}, root, ${actionsParameter});`);
        }
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
            this.#lines.push(`  const ${variable} = new ${node.type}();`);
            this.#applyPixiProps(variable, node.props, true);
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
        this.#applyPixiProps(variable, node.props);
        for (const child of node.children) {
            this.#compileNode(child, variable, actionsParameter);
        }
        return variable;
    }

    #constructPixiNode(node: PixiTemplateNode) {
        if (node.type === 'Text' || node.type === 'BitmapText' || node.type === 'HTMLText') {
            const text = this.#value(node.props.text ?? '');
            const style = this.#styleObject(node.props);
            return `new ${node.type}({ text: ${text}${style ? `, style: ${style}` : ''} })`;
        }
        if (node.type === 'Sprite') {
            return node.props.texture === undefined
                ? 'new Sprite()'
                : `Sprite.from(${this.#value(node.props.texture)})`;
        }
        if (node.type === 'Graphics') {
            return 'new Graphics()';
        }
        return `new ${node.type}()`;
    }

    #applyPixiProps(variable: string, props: Record<string, SceneTemplateValue>, instance = false) {
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
        if (!instance && props.shape !== undefined) {
            this.#drawGraphics(variable, props);
        }
        for (const [key, value] of Object.entries(props)) {
            if (transformProps.has(key) || key === 'shape' || key === 'radius' || key === 'fill' || key === 'texture' || key === 'text' || this.#isTextStyleProp(key)) {
                continue;
            }
            if (instance || pixiProps.has(key)) {
                this.#lines.push(`  ${variable}.${key} = ${this.#value(value)};`);
            }
        }
    }

    #drawGraphics(variable: string, props: Record<string, SceneTemplateValue>) {
        const shape = props.shape;
        if (shape === 'roundRect') {
            this.#lines.push(`  ${variable}.roundRect(0, 0, ${this.#value(props.width ?? 0)}, ${this.#value(props.height ?? 0)}, ${this.#value(props.radius ?? 0)}).fill(${this.#value(props.fill ?? 0xffffff)});`);
            return;
        }
        if (shape === 'rect') {
            this.#lines.push(`  ${variable}.rect(0, 0, ${this.#value(props.width ?? 0)}, ${this.#value(props.height ?? 0)}).fill(${this.#value(props.fill ?? 0xffffff)});`);
        }
    }

    #applyNodeId(variable: string, id: string | undefined) {
        if (id) {
            this.#lines.push(`  ${variable}.label = ${JSON.stringify(id)};`);
        }
    }

    #styleObject(props: Record<string, SceneTemplateValue>) {
        const entries: string[] = [];
        for (const key of ['fontSize', 'fontFamily', 'fontWeight', 'fill']) {
            const value = props[key];
            if (value !== undefined) {
                entries.push(`${key}: ${key === 'fontWeight' ? JSON.stringify(String(value)) : this.#value(value)}`);
            }
        }
        return entries.length > 0 ? `{ ${entries.join(', ')} }` : undefined;
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
        return key === 'fontSize' || key === 'fontFamily' || key === 'fontWeight' || key === 'fill';
    }

    #anonymousName(type: string) {
        this.#nextId += 1;
        return `${type.charAt(0).toLowerCase()}${type.slice(1)}${this.#nextId}`;
    }

    #value(value: SceneTemplateValue) {
        if (typeof value === 'string') {
            return JSON.stringify(value);
        }
        return String(value);
    }
}
