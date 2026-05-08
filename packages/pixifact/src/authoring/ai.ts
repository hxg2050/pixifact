import { ComponentRegistry } from "../runtime";
import { applyCommand } from "../commands";
import type { CommandResult, SceneCommand } from "../commands";
import type { ComponentSpec, NodeSpec } from "../scene";
import type { SceneSpec } from "../scene";

export interface AiComponentSummary {
    id?: string;
    type: string;
    props?: Record<string, unknown>;
}

export interface AiNodeSummary {
    id?: string;
    key?: string;
    role?: string;
    name?: string;
    kind: NodeSpec['kind'];
    transform?: NodeSpec['transform'];
    components: AiComponentSummary[];
    children: AiNodeSummary[];
}

export interface AiSceneSummary {
    name: string;
    version: number;
    root: AiNodeSummary;
}

export interface AiCommandListResult {
    ok: boolean;
    results: CommandResult[];
    scene?: SceneSpec;
    error?: string;
}

function cloneScene(scene: SceneSpec): SceneSpec {
    return structuredClone(scene);
}

function summarizeComponent(component: ComponentSpec): AiComponentSummary {
    return {
        id: component.id,
        type: component.type,
        props: component.props,
    };
}

function summarizeNode(node: NodeSpec): AiNodeSummary {
    return {
        id: node.id,
        key: node.key,
        role: node.role,
        name: node.name,
        kind: node.kind,
        transform: node.transform,
        components: (node.components ?? []).map(summarizeComponent),
        children: node.kind === 'container' ? (node.children ?? []).map(summarizeNode) : [],
    };
}

export function summarizeSceneForAi(scene: SceneSpec): AiSceneSummary {
    return {
        name: scene.name,
        version: scene.version,
        root: summarizeNode(scene.root),
    };
}

export function getAiComponentSchemas() {
    return ComponentRegistry.list().map((schema) => ({
        type: schema.type,
        displayName: schema.displayName,
        category: schema.category,
        description: schema.description,
        disallowMultiple: schema.disallowMultiple,
        require: schema.require,
        props: schema.props.map((prop) => ({
            key: prop.key,
            type: prop.type,
            default: prop.default,
            description: prop.description,
            options: prop.options,
            component: prop.component,
            min: prop.min,
            max: prop.max,
        })),
    })).filter((schema) => schema.category !== 'UI/Graphic');
}

export function dryRunCommands(scene: SceneSpec, commands: SceneCommand[]): AiCommandListResult {
    const draft = cloneScene(scene);
    const results: CommandResult[] = [];

    for (const command of commands) {
        const result = applyCommand(draft, command);
        results.push(result);
        if (!result.ok) {
            return {
                ok: false,
                results,
                error: result.error,
            };
        }
    }

    return {
        ok: true,
        results,
        scene: draft,
    };
}
