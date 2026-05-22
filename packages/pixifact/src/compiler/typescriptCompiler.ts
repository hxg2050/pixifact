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
    readonly #lines: string[] = [];
    readonly #parts: { key: string; type: string }[] = [];
    #nextId = 0;

    constructor(
        private readonly template: SceneTemplate,
        private readonly options: CompileSceneTemplateOptions,
    ) {}

    compile() {
        this.#collectImports(this.template.root);
        this.#collectParts(this.template.root);

        const functionName = this.options.functionName || `mount${this.template.name}Scene`;
        const actionsParameter = this.options.actionsParameter || 'actions';
        const imports = this.#formatImports();
        const partsType = this.#formatPartsType();

        this.#lines.push(`export function ${functionName}(root: Container, ${actionsParameter}: Record<string, () => void> = {}) {`);
        this.#compileRoot(this.template.root, 'root', actionsParameter);
        this.#lines.push(`  return { ${['root', ...this.#parts.map((part) => part.key)].join(', ')} };`);
        this.#lines.push('}');

        return `${imports}\n\n${partsType}\n\n${this.#lines.join('\n')}\n`;
    }

    #formatImports() {
        const imports = ['Container', ...[...this.#imports].filter((item) => item !== 'Container').sort()];
        return `import { ${imports.join(', ')} } from 'pixi.js';`;
    }

    #formatPartsType() {
        const lines = [`export type ${this.template.name}Parts = {`, '  root: Container;'];
        for (const part of this.#parts) {
            lines.push(`  ${part.key}: ${part.type};`);
        }
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
            if (node.key && node.key !== 'root') {
                this.#parts.push({ key: node.key, type: node.type });
            }
            for (const child of node.children) {
                this.#collectParts(child);
            }
            return;
        }
        if (node.kind === 'sceneInstance') {
            if (node.key) {
                this.#parts.push({ key: node.key, type: node.type });
            }
            for (const children of Object.values(node.slots)) {
                for (const child of children) {
                    this.#collectParts(child);
                }
            }
        }
    }

    #compileRoot(node: SceneTemplateNode, variable: string, actionsParameter: string) {
        if (node.kind !== 'pixi' || node.type !== 'Container') {
            throw new Error(`Scene "${this.template.name}" root must be a Container.`);
        }
        this.#applyPixiProps(variable, node.props);
        for (const child of node.children) {
            this.#compileNode(child, variable, actionsParameter);
        }
    }

    #compileNode(node: SceneTemplateNode, parent: string, actionsParameter: string) {
        if (node.kind === 'slotOutlet') {
            return;
        }
        if (node.kind === 'sceneInstance') {
            this.#compileSceneInstance(node, parent, actionsParameter);
            return;
        }
        this.#compilePixiNode(node, parent, actionsParameter);
    }

    #compilePixiNode(node: PixiTemplateNode, parent: string, actionsParameter: string) {
        const variable = node.key || this.#anonymousName(node.type);
        this.#lines.push(`  const ${variable} = ${this.#constructPixiNode(node)};`);
        this.#applyPixiProps(variable, node.props);
        this.#lines.push(`  ${parent}.addChild(${variable});`);
        for (const child of node.children) {
            this.#compileNode(child, variable, actionsParameter);
        }
    }

    #compileSceneInstance(node: SceneInstanceTemplateNode, parent: string, actionsParameter: string) {
        const variable = node.key || this.#anonymousName(node.type);
        this.#lines.push(`  const ${variable} = new ${node.type}();`);
        this.#applyPixiProps(variable, node.props, true);
        for (const [name, action] of Object.entries(node.events)) {
            this.#lines.push(`  ${variable}.${this.#eventMethod(name)}(${actionsParameter}.${action});`);
        }
        this.#lines.push(`  ${parent}.addChild(${variable});`);
        for (const [slot, children] of Object.entries(node.slots)) {
            for (const child of children) {
                const childVariable = this.#compileSlottedNode(child, `${variable}.slots.${slot}`, actionsParameter);
                this.#lines.push(`  ${variable}.slots.${slot}.addChild(${childVariable});`);
            }
        }
    }

    #compileSlottedNode(node: SceneTemplateNode, slotTarget: string, actionsParameter: string) {
        if (node.kind === 'slotOutlet') {
            throw new Error(`Cannot place <slot> inside ${slotTarget}.`);
        }
        if (node.kind === 'sceneInstance') {
            const variable = node.key || this.#anonymousName(node.type);
            this.#lines.push(`  const ${variable} = new ${node.type}();`);
            this.#applyPixiProps(variable, node.props, true);
            for (const [name, action] of Object.entries(node.events)) {
                this.#lines.push(`  ${variable}.${this.#eventMethod(name)}(${actionsParameter}.${action});`);
            }
            for (const [slot, children] of Object.entries(node.slots)) {
                for (const child of children) {
                    const childVariable = this.#compileSlottedNode(child, `${variable}.slots.${slot}`, actionsParameter);
                    this.#lines.push(`  ${variable}.slots.${slot}.addChild(${childVariable});`);
                }
            }
            return variable;
        }

        const variable = node.key || this.#anonymousName(node.type);
        this.#lines.push(`  const ${variable} = ${this.#constructPixiNode(node)};`);
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

    #styleObject(props: Record<string, SceneTemplateValue>) {
        const entries: string[] = [];
        for (const key of ['fontSize', 'fontFamily', 'fontWeight', 'fill']) {
            const value = props[key];
            if (value !== undefined) {
                entries.push(`${key}: ${this.#value(value)}`);
            }
        }
        return entries.length > 0 ? `{ ${entries.join(', ')} }` : undefined;
    }

    #isTextStyleProp(key: string) {
        return key === 'fontSize' || key === 'fontFamily' || key === 'fontWeight' || key === 'fill';
    }

    #eventMethod(name: string) {
        return `on${name.charAt(0).toUpperCase()}${name.slice(1)}`;
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
