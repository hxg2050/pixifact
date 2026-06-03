import type {
    PixiTemplateNode,
    SceneInstanceTemplateNode,
    SceneTemplate,
    SceneTemplateNode,
    SceneTemplatePrimitiveType,
    SceneTemplateValue,
    SlotOutletTemplateNode,
} from './spec';
import { pixiSceneFieldSchema } from './pixiNodeSchema';
import { builtinSceneAssetId, isBuiltinSceneName } from './builtinScenes';

interface XmlElement {
    name: string;
    attributes: Record<string, string>;
    children: XmlElement[];
}

const pixiTypes = new Set<string>([
    'Container',
    'Sprite',
    'Text',
    'Graphics',
    'BitmapText',
    'HTMLText',
    'Mesh',
    'NineSliceSprite',
    'TilingSprite',
    'DOMContainer',
]);

export function parseSceneTemplate(source: string): SceneTemplate {
    const root = new TemplateXmlParser(source).parse();
    if (root.name !== 'Scene') {
        throw new Error(`Expected <Scene> root, received <${root.name}>.`);
    }

    const name = root.attributes.name;
    if (!name) {
        throw new Error('Scene template is missing name.');
    }

    if (root.attributes.class !== undefined) {
        throw new Error('Scene class is inferred from the paired script @scene class; remove the class attribute.');
    }

    if (root.attributes.script !== undefined) {
        throw new Error('Scene script binding is inferred from the colocated TypeScript file.');
    }

    const children = root.children.map(parseTemplateNode);
    assertUniqueIds(name, children);

    return {
        version: 2,
        name,
        props: parseProps(root, ['name']),
        interface: emptyInterface(),
        children,
    };
}

function emptyInterface() {
    return {
        props: {},
        events: {},
        slots: {},
    };
}

function parseTemplateNode(element: XmlElement): SceneTemplateNode {
    if (element.name === 'slot') {
        const node: SlotOutletTemplateNode = {
            kind: 'slotOutlet',
            name: element.attributes.name || 'default',
        };
        return node;
    }

    if (pixiTypes.has(element.name)) {
        const node: PixiTemplateNode = {
            kind: 'pixi',
            type: element.name as SceneTemplatePrimitiveType,
            props: parseProps(element, ['id', 'slot']),
            children: element.children.map(parseTemplateNode),
            ...(element.attributes.id ? { id: element.attributes.id } : {}),
        };
        return node;
    }

    if (element.attributes.scene !== undefined || isBuiltinSceneName(element.name)) {
        const slots: Record<string, SceneTemplateNode[]> = {};
        for (const child of element.children) {
            const slot = child.attributes.slot || 'default';
            slots[slot] = slots[slot] ?? [];
            slots[slot].push(parseTemplateNode(removeAttribute(child, 'slot')));
        }

        const node: SceneInstanceTemplateNode = {
            kind: 'sceneInstance',
            type: element.name,
            scene: element.attributes.scene !== undefined ? element.attributes.scene : builtinSceneAssetId(element.name),
            props: parseProps(element, ['id', 'scene', 'slot'], isEventAttribute),
            events: parseEvents(element),
            slots,
            ...(element.attributes.id ? { id: element.attributes.id } : {}),
        };
        return node;
    }

    throw new Error(`Unsupported template tag <${element.name}>. Add scene="..." or use a built-in Scene name.`);
}

function parseProps(
    element: XmlElement,
    omitted: string[],
    shouldOmit: (name: string) => boolean = () => false,
) {
    const props: Record<string, SceneTemplateValue> = {};
    for (const [name, value] of Object.entries(element.attributes)) {
        if (omitted.includes(name) || shouldOmit(name)) {
            continue;
        }
        const parsed = parseAttributeValue(name, value);
        const path = name.split('.');
        if (path.length === 1) {
            if (props[name] && typeof props[name] === 'object') {
                throw new Error(`Prop "${name}" cannot be both scalar and structured.`);
            }
            props[name] = parsed;
            continue;
        }
        const [root, field, ...rest] = path;
        if (!root || !field || rest.length > 0) {
            throw new Error(`Unsupported structured prop path "${name}".`);
        }
        if (props[root] !== undefined && typeof props[root] !== 'object') {
            throw new Error(`Prop "${root}" cannot be both scalar and structured.`);
        }
        if (typeof parsed === 'object') {
            throw new Error(`Structured prop field "${name}" cannot contain an object value.`);
        }
        const objectValue = (props[root] ?? {}) as Record<string, string | number | boolean>;
        objectValue[field] = parsed;
        props[root] = objectValue;
    }
    return props;
}

function parseEvents(element: XmlElement) {
    const events: Record<string, string> = {};
    for (const [name, value] of Object.entries(element.attributes)) {
        const event = eventName(name);
        if (event) {
            events[event] = value;
        }
    }
    return events;
}

function eventName(name: string) {
    if (name.startsWith('@')) {
        return name.slice(1);
    }
    if (name.startsWith('on-')) {
        return name.slice(3);
    }
    if (name.startsWith('on:')) {
        return name.slice(3);
    }
    return undefined;
}

function isEventAttribute(name: string) {
    return eventName(name) !== undefined;
}

function parseAttributeValue(name: string, value: string): SceneTemplateValue {
    if (pixiSceneFieldSchema(name)?.type === 'string') {
        return value;
    }
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
    if (/^#[0-9a-fA-F]{6}$/.test(value)) return Number.parseInt(value.slice(1), 16);
    return value;
}

function removeAttribute(element: XmlElement, name: string): XmlElement {
    const attributes = { ...element.attributes };
    delete attributes[name];
    return {
        ...element,
        attributes,
    };
}

function assertUniqueIds(sceneName: string, children: SceneTemplateNode[]) {
    const seen = new Set<string>();

    function visit(node: SceneTemplateNode) {
        if (node.kind === 'slotOutlet') {
            return;
        }
        if (node.id) {
            if (seen.has(node.id)) {
                throw new Error(`Scene "${sceneName}" has duplicate id "${node.id}".`);
            }
            seen.add(node.id);
        }
        if (node.kind === 'pixi') {
            for (const child of node.children) {
                visit(child);
            }
            return;
        }
        for (const slottedChildren of Object.values(node.slots)) {
            for (const child of slottedChildren) {
                visit(child);
            }
        }
    }

    for (const child of children) {
        visit(child);
    }
}

class TemplateXmlParser {
    #index = 0;

    constructor(private readonly source: string) {}

    parse() {
        this.#skipWhitespace();
        const element = this.#parseElement();
        this.#skipWhitespace();
        if (this.#index !== this.source.length) {
            throw new Error(`Unexpected content after <${element.name}>.`);
        }
        return element;
    }

    #parseElement(): XmlElement {
        this.#consume('<');
        if (this.#peek('/')) {
            throw new Error('Unexpected closing tag.');
        }

        const name = this.#readName();
        const attributes: Record<string, string> = {};

        while (true) {
            this.#skipWhitespace();
            if (this.#consumeIf('/>')) {
                return { name, attributes, children: [] };
            }
            if (this.#consumeIf('>')) {
                break;
            }
            const attributeName = this.#readName();
            this.#skipWhitespace();
            this.#consume('=');
            this.#skipWhitespace();
            attributes[attributeName] = this.#readQuotedValue();
        }

        const children: XmlElement[] = [];
        while (true) {
            this.#skipWhitespace();
            if (this.#consumeIf(`</${name}>`)) {
                return { name, attributes, children };
            }
            if (this.#peek('<!--')) {
                this.#skipComment();
                continue;
            }
            if (this.#peek('<')) {
                children.push(this.#parseElement());
                continue;
            }
            throw new Error(`Unexpected text inside <${name}>.`);
        }
    }

    #readName() {
        const start = this.#index;
        while (this.#index < this.source.length && /[A-Za-z0-9_:@.-]/.test(this.source[this.#index])) {
            this.#index += 1;
        }
        if (start === this.#index) {
            throw new Error(`Expected name at offset ${this.#index}.`);
        }
        return this.source.slice(start, this.#index);
    }

    #readQuotedValue() {
        const quote = this.source[this.#index];
        if (quote !== '"' && quote !== "'") {
            throw new Error(`Expected quoted value at offset ${this.#index}.`);
        }
        this.#index += 1;
        const start = this.#index;
        while (this.#index < this.source.length && this.source[this.#index] !== quote) {
            this.#index += 1;
        }
        const value = this.source.slice(start, this.#index);
        this.#consume(quote);
        return decodeEntities(value);
    }

    #skipWhitespace() {
        while (this.#index < this.source.length && /\s/.test(this.source[this.#index])) {
            this.#index += 1;
        }
    }

    #skipComment() {
        const end = this.source.indexOf('-->', this.#index + 4);
        if (end === -1) {
            throw new Error('Unterminated comment.');
        }
        this.#index = end + 3;
    }

    #consume(value: string) {
        if (!this.#consumeIf(value)) {
            throw new Error(`Expected "${value}" at offset ${this.#index}.`);
        }
    }

    #consumeIf(value: string) {
        if (!this.source.startsWith(value, this.#index)) {
            return false;
        }
        this.#index += value.length;
        return true;
    }

    #peek(value: string) {
        return this.source.startsWith(value, this.#index);
    }
}

function decodeEntities(value: string) {
    return value
        .replaceAll('&quot;', '"')
        .replaceAll('&apos;', "'")
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&amp;', '&');
}
