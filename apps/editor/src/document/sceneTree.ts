import {
    compilerSceneNodeLocator,
    type SceneTemplateNode,
} from 'pixifact/compiler';

export interface SceneTreeEntry {
    children: SceneTreeEntry[];
    locator: string;
    node: SceneTemplateNode;
}

export function sceneTreeEntries(
    nodes: readonly SceneTemplateNode[],
    parentLocator = '__scene__',
): SceneTreeEntry[] {
    return nodes.map((node, index) => {
        const path = parentLocator === '__scene__' ? String(index) : `${parentLocator}/${index}`;
        const locator = compilerSceneNodeLocator(node, path);
        const children = node.kind === 'pixi'
            ? sceneTreeEntries(node.children, locator)
            : node.kind === 'sceneInstance'
                ? Object.entries(node.slots).flatMap(([slot, slotChildren]) => (
                    sceneTreeEntries(slotChildren, `${locator}/slot:${slot}`)
                ))
                : [];
        return { children, locator, node };
    });
}

export function findSceneNodeByLocator(nodes: readonly SceneTemplateNode[], locator: string) {
    const queue = [...sceneTreeEntries(nodes)];
    while (queue.length > 0) {
        const entry = queue.shift()!;
        if (entry.locator === locator) {
            return entry.node;
        }
        queue.unshift(...entry.children);
    }
    return undefined;
}
