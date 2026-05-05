import { GameObject, Group } from "../../core";
import type { Component } from "../../core";
import { instantiate } from "../prefab";
import type { InstantiateContext, PrefabSpec } from "../prefab";

export interface RuntimePreview {
    root: Group;
    nodes: Map<string, Group>;
    components: Map<string, Component>;
    resolveNode(runtimeNode: Group): string | undefined;
}

export function createRuntimePreview(
    prefab: PrefabSpec,
    parent?: Group,
    context?: InstantiateContext,
): RuntimePreview {
    const result = instantiate(prefab, parent, context);
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
