import { describe, expect, it } from 'vitest';
import type { ProjectFileTreeNode } from '../apps/editor/src/services/projectFileTree';
import { createAgentCliWorkflow } from '../apps/editor/src/panels/agentWorkflow';

function spaceHudProjectTree(): ProjectFileTreeNode {
    return {
        id: 'space-hud-game',
        name: 'space-hud-game',
        path: 'space-hud-game',
        kind: 'folder',
        depth: 0,
        systemPath: '/repo/sample-projects/space-hud-game',
        projectRootPath: '/repo/sample-projects/space-hud-game',
        children: [{
            id: 'space-hud-game/src',
            name: 'src',
            path: 'space-hud-game/src',
            kind: 'folder',
            depth: 1,
            children: [{
                id: 'space-hud-game/src/scenes',
                name: 'scenes',
                path: 'space-hud-game/src/scenes',
                kind: 'folder',
                depth: 2,
                children: [{
                    id: 'space-hud-game/src/scenes/Hud.scene',
                    name: 'Hud.scene',
                    path: 'space-hud-game/src/scenes/Hud.scene',
                    kind: 'scene',
                    depth: 3,
                }],
            }],
        }],
    };
}

describe('Agent CLI workflow panel model', () => {
    it('uses the opened compiler scene to generate project-specific CLI commands', () => {
        const workflow = createAgentCliWorkflow({
            projectTree: spaceHudProjectTree(),
            openedScenePath: 'space-hud-game/src/scenes/Hud.scene',
        });

        expect(workflow.projectRoot).toBe('/repo/sample-projects/space-hud-game');
        expect(workflow.scenePath).toBe('src/scenes/Hud.scene');
        expect(workflow.commands).toEqual([
            'bun run pixifact -- scene inspect --project-root /repo/sample-projects/space-hud-game --scene src/scenes/Hud.scene',
            'bun run pixifact -- scene validate --project-root /repo/sample-projects/space-hud-game --scene src/scenes/Hud.scene',
            'bun run pixifact -- compile-scenes --project-root /repo/sample-projects/space-hud-game',
            'cd /repo/sample-projects/space-hud-game && bun run build',
        ]);
        expect(workflow.agentPrompt).toContain('A Scene asset is a pair of colocated files with the same basename.');
        expect(workflow.agentPrompt).toContain('Do not add script="..." to .scene files.');
        expect(workflow.agentPrompt).toContain('The unique Scene id is the project-relative .scene path.');
        expect(workflow.agentPrompt).toContain('Do not edit .pixifact/generated.');
    });

    it('falls back to placeholders when no project or scene is open', () => {
        const workflow = createAgentCliWorkflow({});

        expect(workflow.projectRoot).toBe('<project-root>');
        expect(workflow.scenePath).toBe('<scene>');
        expect(workflow.commands[0]).toBe('bun run pixifact -- scene inspect --project-root <project-root> --scene <scene>');
        expect(workflow.projectReady).toBe(false);
        expect(workflow.sceneReady).toBe(false);
    });

    it('quotes shell arguments in generated commands and prompt run lines', () => {
        const projectTree = spaceHudProjectTree();
        projectTree.systemPath = '/repo/sample projects/space hud game';
        projectTree.projectRootPath = '/repo/sample projects/space hud game';

        const workflow = createAgentCliWorkflow({
            projectTree,
            openedScenePath: 'space-hud-game/src/scenes/Hud.scene',
        });

        expect(workflow.commands[0]).toBe(
            "bun run pixifact -- scene inspect --project-root '/repo/sample projects/space hud game' --scene src/scenes/Hud.scene",
        );
        expect(workflow.commands[3]).toBe("cd '/repo/sample projects/space hud game' && bun run build");
        expect(workflow.agentPrompt).toContain(
            "bun run pixifact -- scene validate --project-root '/repo/sample projects/space hud game' --scene src/scenes/Hud.scene",
        );
    });
});
