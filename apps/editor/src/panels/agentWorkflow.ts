import type { ProjectFileTreeNode } from '../services/projectFileTree';
import { findFileByPath, projectFileRelativePath } from '../services/projectFileTree';

export interface AgentCliWorkflowInput {
    projectTree?: ProjectFileTreeNode;
    openedScenePath?: string;
}

export interface AgentCliWorkflow {
    projectReady: boolean;
    sceneReady: boolean;
    projectRoot: string;
    scenePath: string;
    commands: string[];
    agentPrompt: string;
}

function quoteShellArg(value: string) {
    if (value.startsWith('<') && value.endsWith('>')) {
        return value;
    }
    if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) {
        return value;
    }
    return `'${value.replaceAll("'", "'\\''")}'`;
}

function projectRoot(projectTree: ProjectFileTreeNode | undefined) {
    return projectTree?.projectRootPath ?? projectTree?.systemPath ?? '<project-root>';
}

function scenePath(projectTree: ProjectFileTreeNode | undefined, openedScenePath: string | undefined) {
    if (!projectTree || !openedScenePath) {
        return '<scene>';
    }
    const file = findFileByPath(projectTree, openedScenePath);
    return file ? projectFileRelativePath(projectTree, file) : '<scene>';
}

export function createAgentCliWorkflow(input: AgentCliWorkflowInput): AgentCliWorkflow {
    const root = projectRoot(input.projectTree);
    const scene = scenePath(input.projectTree, input.openedScenePath);
    const projectRootArg = quoteShellArg(root);
    const sceneArg = quoteShellArg(scene);
    const projectReady = root !== '<project-root>';
    const sceneReady = scene !== '<scene>';

    return {
        projectReady,
        sceneReady,
        projectRoot: root,
        scenePath: scene,
        commands: [
            `bun run pixifact -- scene inspect --project-root ${projectRootArg} --scene ${sceneArg}`,
            `bun run pixifact -- scene validate --project-root ${projectRootArg} --scene ${sceneArg}`,
            `bun run pixifact -- compile-scenes --project-root ${projectRootArg}`,
            `cd ${projectRootArg} && bun run build`,
        ],
        agentPrompt: [
            'You are editing a Pixifact compiler scene.',
            `Edit ${scene} as the source of truth.`,
            'Do not edit .pixifact/generated or generated TypeScript files.',
            'Use Pixifact CLI to inspect and validate the scene.',
            `After editing, run: bun run pixifact -- scene validate --project-root ${projectRootArg} --scene ${sceneArg}`,
            `Then run: bun run pixifact -- compile-scenes --project-root ${projectRootArg}`,
            'Finally run the smallest relevant build or test.',
        ].join('\n'),
    };
}
