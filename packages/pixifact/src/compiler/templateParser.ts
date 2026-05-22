import type {
    PixiTemplateNode,
    SceneInstanceTemplateNode,
    SceneTemplate,
    SceneTemplateInterface,
    SceneTemplateNode,
    SceneTemplatePrimitiveType,
    SceneTemplateValue,
    SlotOutletTemplateNode,
} from './spec';

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

    const interfaceElement = root.children.find((child) => child.name === 'Interface');
    const templateChildren = root.children.filter((child) => child.name !== 'Interface');
    if (templateChildren.length !== 1) {
        throw new Error(`Scene "${name}" must have exactly one template root.`);
    }

    const script = root.attributes.script
        ? {
            path: root.attributes.script,
            className: root.attributes.class || name,
        }
        : undefined;

    return {
        version: 2,
        name,
        script,
        interface: parseInterface(interfaceElement),
        root: parseTemplateNode(templateChildren[0]),
    };
}

function parseInterface(element: XmlElement | undefined): SceneTemplateInterface {
    const result: SceneTemplateInterface = {
        props: {},
        events: {},
        slots: {},
    };

    if (!element) {
        return result;
    }

    for (const child of element.children) {
        if (child.name === 'Prop') {
            const name = requiredAttribute(child, 'name');
            result.props[name] = {
                type: requiredAttribute(child, 'type'),
                ...(child.attributes.default !== undefined ? { default: parseAttributeValue(child.attributes.default) } : {}),
            };
            continue;
        }
        if (child.name === 'Event') {
            result.events[requiredAttribute(child, 'name')] = { type: 'action' };
            continue;
        }
        if (child.name === 'Slot') {
            const name = requiredAttribute(child, 'name');
            result.slots[name] = {
                multiple: child.attributes.multiple === undefined
                    ? true
                    : parseAttributeValue(child.attributes.multiple) === true,
            };
            continue;
        }
        throw new Error(`Unsupported interface tag <${child.name}>.`);
    }

    return result;
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
            props: parseProps(element, ['key', 'slot']),
            children: element.children.map(parseTemplateNode),
            ...(element.attributes.key ? { key: element.attributes.key } : {}),
        };
        return node;
    }

    if (element.attributes.scene) {
        const slots: Record<string, SceneTemplateNode[]> = {};
        for (const child of element.children) {
            const slot = child.attributes.slot || 'default';
            slots[slot] = slots[slot] ?? [];
            slots[slot].push(parseTemplateNode(removeAttribute(child, 'slot')));
        }

        const node: SceneInstanceTemplateNode = {
            kind: 'sceneInstance',
            type: element.name,
            scene: element.attributes.scene,
            props: parseProps(element, ['key', 'scene', 'slot'], isEventAttribute),
            events: parseEvents(element),
            slots,
            ...(element.attributes.key ? { key: element.attributes.key } : {}),
        };
        return node;
    }

    throw new Error(`Unsupported template tag <${element.name}>.`);
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
        props[name] = parseAttributeValue(value);
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

function parseAttributeValue(value: string): SceneTemplateValue {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
    if (/^#[0-9a-fA-F]{6}$/.test(value)) return Number.parseInt(value.slice(1), 16);
    return value;
}

function requiredAttribute(element: XmlElement, name: string) {
    const value = element.attributes[name];
    if (value === undefined) {
        throw new Error(`<${element.name}> is missing ${name}.`);
    }
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
