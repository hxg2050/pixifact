import type { ComponentSpec, NodeSpec, PrefabSpec } from '../../../../src';
import { prefabAssetName } from './prefabNaming';

function collectLocators(node: NodeSpec, locators = new Set<string>()) {
    if (node.id) {
        locators.add(node.id);
    }
    if (node.key) {
        locators.add(node.key);
    }
    for (const component of node.components ?? []) {
        if (component.id) {
            locators.add(component.id);
        }
    }
    for (const child of node.children ?? []) {
        collectLocators(child, locators);
    }
    return locators;
}

function lowerFirst(value: string) {
    return value ? `${value[0].toLowerCase()}${value.slice(1)}` : value;
}

function nextInstancePrefix(prefabName: string, target: PrefabSpec) {
    const locators = collectLocators(target.root);
    const base = `${lowerFirst(prefabAssetName(prefabName))}Instance`;
    let index = 1;
    let prefix = `${base}${index}`;

    while ([...locators].some((locator) => locator.startsWith(prefix))) {
        index += 1;
        prefix = `${base}${index}`;
    }

    return prefix;
}

function renameRef(value: unknown, idMap: ReadonlyMap<string, string>): unknown {
    if (typeof value === 'string') {
        return idMap.get(value) ?? value;
    }

    if (!value || typeof value !== 'object') {
        return value;
    }

    const ref = value as { node?: string; component?: string };
    if (!ref.component && !ref.node) {
        return structuredClone(value);
    }

    return {
        ...ref,
        node: ref.node ? idMap.get(ref.node) ?? ref.node : undefined,
        component: ref.component ? idMap.get(ref.component) ?? ref.component : undefined,
    };
}

function cloneComponent(component: ComponentSpec, idMap: ReadonlyMap<string, string>): ComponentSpec {
    const schemaProps = component.props ?? {};
    const props: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schemaProps)) {
        props[key] = renameRef(value, idMap);
    }

    return {
        ...component,
        id: component.id ? idMap.get(component.id) : undefined,
        props,
    };
}

function collectNodeMappings(node: NodeSpec, prefix: string, idMap: Map<string, string>) {
    if (node.id) {
        idMap.set(node.id, `${prefix}_${node.id}`);
    }
    if (node.key) {
        idMap.set(node.key, `${prefix}_${node.key}`);
    }
    for (const component of node.components ?? []) {
        if (component.id) {
            idMap.set(component.id, `${prefix}_${component.id}`);
        }
    }
    for (const child of node.children ?? []) {
        collectNodeMappings(child, prefix, idMap);
    }
}

function cloneNode(node: NodeSpec, idMap: ReadonlyMap<string, string>): NodeSpec {
    return {
        ...node,
        id: node.id ? idMap.get(node.id) : undefined,
        key: node.key ? idMap.get(node.key) : undefined,
        name: node.name,
        transform: node.transform ? structuredClone(node.transform) : undefined,
        components: (node.components ?? []).map((component) => cloneComponent(component, idMap)),
        children: (node.children ?? []).map((child) => cloneNode(child, idMap)),
    };
}

export function createPrefabInstanceNode(source: PrefabSpec, target: PrefabSpec): NodeSpec {
    const prefix = nextInstancePrefix(source.name, target);
    const idMap = new Map<string, string>();
    collectNodeMappings(source.root, prefix, idMap);
    const node = cloneNode(source.root, idMap);
    node.name = `${source.name} 实例`;
    node.role = source.root.role ?? 'prefab-instance';
    return node;
}
