import type { SceneTemplate, SceneTemplateNode } from './spec';

export interface MissingScenePartReference {
    property: string;
    id: string;
}

export function findMissingScenePartReferences(
    template: SceneTemplate,
    parts: Readonly<Record<string, string>>,
): MissingScenePartReference[] {
    const nodeIds = collectSceneNodeIds(template.children);
    return Object.entries(parts)
        .filter(([, id]) => !nodeIds.has(id))
        .map(([property, id]) => ({ property, id }));
}

function collectSceneNodeIds(nodes: readonly SceneTemplateNode[], ids = new Set<string>()) {
    for (const node of nodes) {
        if (node.kind === 'slotOutlet') {
            continue;
        }
        if (node.id) {
            ids.add(node.id);
        }
        if (node.kind === 'pixi') {
            collectSceneNodeIds(node.children, ids);
            continue;
        }
        for (const children of Object.values(node.slots)) {
            collectSceneNodeIds(children, ids);
        }
    }
    return ids;
}
