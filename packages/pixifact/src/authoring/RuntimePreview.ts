import { GameObject, Group } from "../runtime";
import type { Component } from "../runtime";
import { instantiate } from "../scene";
import type { InstantiateContext, SceneSpec } from "../scene";

export interface RuntimePreview {
    root: Group;
    nodes: Map<string, Group>;
    components: Map<string, Component>;
    resolveNode(runtimeNode: Group): string | undefined;
}

export function createRuntimePreview(
    scene: SceneSpec,
    parent?: Group,
    context?: InstantiateContext,
): RuntimePreview {
    const result = instantiate(scene, parent, context);
    const nodeIdsByObject = new WeakMap<Group, string>();

    for (const [id, node] of result.nodes) {
        if (!nodeIdsByObject.has(node)) {
            nodeIdsByObject.set(node, id);
        }
    }

    return {
        root: result.root,
        nodes: result.nodes,
        components: result.components as Map<string, Component>,
        resolveNode(runtimeNode: Group) {
            return nodeIdsByObject.get(runtimeNode);
        },
    };
}

export function destroyRuntimePreview(preview?: RuntimePreview) {
    if (!preview) {
        return;
    }
    GameObject.destroy(preview.root);
}
