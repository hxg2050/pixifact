import type {
    SceneInstanceTemplateNode,
    SceneTemplate,
    SceneTemplateNode,
    SceneTemplateValue,
} from './spec';

const colorPropNames = new Set([
    'backgroundColor',
    'borderColor',
    'disabledColor',
    'fill',
    'highlightedColor',
    'normalColor',
    'pressedColor',
    'strokeColor',
    'textColor',
    'tint',
]);

type TemplateAttribute = readonly [string, SceneTemplateValue];

export function serializeSceneTemplate(template: SceneTemplate) {
    const rootAttributes: TemplateAttribute[] = [
        ['name', template.name],
        ...(template.script ? [['script', template.script.path] as const] : []),
        ...Object.entries(template.props),
    ];
    const lines = [`<Scene${serializeAttributes(rootAttributes)}>`];

    for (const child of template.children) {
        lines.push(...serializeTemplateNode(child, 1));
    }

    lines.push('</Scene>');
    return `${lines.join('\n')}\n`;
}

function serializeTemplateNode(
    node: SceneTemplateNode,
    depth: number,
    extraAttributes: TemplateAttribute[] = [],
): string[] {
    if (node.kind === 'slotOutlet') {
        const attributes: TemplateAttribute[] = [
            ...(node.name === 'default' ? [] : [['name', node.name] as const]),
            ...extraAttributes,
        ];
        return [`${indent(depth)}<slot${serializeAttributes(attributes)} />`];
    }

    if (node.kind === 'pixi') {
        const attributes: TemplateAttribute[] = [
            ...(node.id ? [['id', node.id] as const] : []),
            ...extraAttributes,
            ...Object.entries(node.props),
        ];
        return serializeElement(node.type, attributes, node.children, depth);
    }

    const attributes: TemplateAttribute[] = [
        ...(node.id ? [['id', node.id] as const] : []),
        ['scene', node.scene],
        ...extraAttributes,
        ...Object.entries(node.props),
        ...Object.entries(node.events).map(([name, value]) => [`@${name}`, value] as const),
    ];
    return serializeElement(node.type, attributes, serializeSceneInstanceChildren(node), depth);
}

function serializeSceneInstanceChildren(node: SceneInstanceTemplateNode) {
    return Object.entries(node.slots).flatMap(([slot, children]) => children.map((child) => ({
        node: child,
        slot,
    })));
}

function serializeElement(
    tag: string,
    attributes: TemplateAttribute[],
    children: SceneTemplateNode[] | { node: SceneTemplateNode; slot: string }[],
    depth: number,
) {
    if (children.length === 0) {
        return [`${indent(depth)}<${tag}${serializeAttributes(attributes)} />`];
    }

    const lines = [`${indent(depth)}<${tag}${serializeAttributes(attributes)}>`];
    for (const child of children) {
        if ('slot' in child) {
            const slotAttributes: TemplateAttribute[] = child.slot === 'default' ? [] : [['slot', child.slot]];
            lines.push(...serializeTemplateNode(child.node, depth + 1, slotAttributes));
        } else {
            lines.push(...serializeTemplateNode(child, depth + 1));
        }
    }
    lines.push(`${indent(depth)}</${tag}>`);
    return lines;
}

function serializeAttributes(attributes: TemplateAttribute[]) {
    return attributes
        .map(([name, value]) => ` ${name}="${escapeAttribute(formatAttributeValue(name, value))}"`)
        .join('');
}

function formatAttributeValue(name: string, value: SceneTemplateValue) {
    if (typeof value === 'number' && colorPropNames.has(name)) {
        return `#${value.toString(16).padStart(6, '0').slice(-6)}`;
    }
    return String(value);
}

function escapeAttribute(value: string) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

function indent(depth: number) {
    return '  '.repeat(depth);
}
