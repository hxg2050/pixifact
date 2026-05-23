import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectFileTreeNode } from '../apps/editor/src/services/projectFileTree';
import {
    compileCompilerScenes,
    CompilerSceneBuildError,
    createReadyRunStatus,
    startEditorRun,
    stopEditorRun,
} from '../apps/editor/src/services/editorRunService';

const config = vi.hoisted(() => ({
    value: {
        version: 1,
        name: 'Space HUD Game',
        scenes: {
            hud: 'scenes/Hud.scene',
        },
        run: {
            command: 'bun',
            args: ['run', 'dev'],
            cwd: '.',
            url: 'http://localhost:5173',
        },
    } as Record<string, unknown>,
}));

const host = vi.hoisted(() => ({
    startHostRunProcess: vi.fn(async () => ({ sessionId: 'run-1' })),
    getHostRunProcessStatus: vi.fn(async () => ({
        sessionId: 'run-1',
        running: true,
        exitCode: null,
        stdout: ['ready'],
        stderr: [],
    })),
    stopHostRunProcess: vi.fn(async () => ({
        sessionId: 'run-1',
        running: false,
        exitCode: 0,
        stdout: ['ready'],
        stderr: [],
    })),
}));

vi.mock('../apps/editor/src/services/hostBridge', () => ({
    readHostProjectFileText: vi.fn(async () => JSON.stringify(config.value)),
    startHostRunProcess: host.startHostRunProcess,
    getHostRunProcessStatus: host.getHostRunProcessStatus,
    stopHostRunProcess: host.stopHostRunProcess,
}));

function projectTree(): ProjectFileTreeNode {
    return {
        id: 'SpaceGame',
        name: 'SpaceGame',
        path: 'SpaceGame',
        kind: 'folder',
        depth: 0,
        systemPath: '/tmp/SpaceGame',
        projectRootPath: '/tmp/SpaceGame',
        children: [{
            id: 'SpaceGame/pixifact.project.json',
            name: 'pixifact.project.json',
            path: 'SpaceGame/pixifact.project.json',
            kind: 'unknown',
            depth: 1,
            systemPath: '/tmp/SpaceGame/pixifact.project.json',
            projectRootPath: '/tmp/SpaceGame',
        }],
    };
}

describe('editor run service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        config.value = {
            version: 1,
            name: 'Space HUD Game',
            scenes: {
                hud: 'scenes/Hud.scene',
            },
            run: {
                command: 'bun',
                args: ['run', 'dev'],
                cwd: '.',
                url: 'http://localhost:5173',
            },
        };
    });

    it('creates a ready status from pixifact.project.json', async () => {
        await expect(createReadyRunStatus(projectTree())).resolves.toMatchObject({
            state: 'ready',
            projectName: 'Space HUD Game',
            command: 'bun run dev',
        });
    });

    it('starts the configured run command through the host', async () => {
        const status = await startEditorRun(projectTree(), false);

        expect(host.startHostRunProcess).toHaveBeenCalledWith(
            '/tmp/SpaceGame',
            'bun',
            ['run', 'dev'],
            '.',
            'http://localhost:5173',
        );
        expect(status).toMatchObject({
            state: 'running',
            sessionId: 'run-1',
            stdout: ['ready'],
        });
    });

    it('compiles compiler scenes through the project compile script', async () => {
        host.getHostRunProcessStatus.mockResolvedValueOnce({
            sessionId: 'run-1',
            running: false,
            exitCode: 0,
            stdout: ['compiled'],
            stderr: [],
        });

        const status = await compileCompilerScenes(projectTree());

        expect(host.startHostRunProcess).toHaveBeenCalledWith(
            '/tmp/SpaceGame',
            'bun',
            ['run', 'compile:scenes'],
            '.',
        );
        expect(status).toMatchObject({
            exitCode: 0,
            stdout: ['compiled'],
        });
    });

    it('surfaces compiler scene build failures', async () => {
        host.getHostRunProcessStatus.mockResolvedValueOnce({
            sessionId: 'run-1',
            running: false,
            exitCode: 1,
            stdout: [],
            stderr: ['compile failed'],
        });

        const promise = compileCompilerScenes(projectTree());

        await expect(promise).rejects.toThrow(CompilerSceneBuildError);
        await expect(promise).rejects.toThrow('compile failed');
    });

    it('requires dirty scenes to be saved before running', async () => {
        await expect(startEditorRun(projectTree(), true)).rejects.toThrow('请先保存');
        expect(host.startHostRunProcess).not.toHaveBeenCalled();
    });

    it('treats a project without run config as unconfigured', async () => {
        delete config.value.run;

        await expect(createReadyRunStatus(projectTree())).resolves.toMatchObject({
            state: 'unconfigured',
        });
        await expect(startEditorRun(projectTree(), false)).resolves.toMatchObject({
            state: 'unconfigured',
        });
        expect(host.startHostRunProcess).not.toHaveBeenCalled();
    });

    it('stops only the current run session', async () => {
        const status = await stopEditorRun({
            state: 'running',
            sessionId: 'run-1',
            stdout: [],
            stderr: [],
        });

        expect(host.stopHostRunProcess).toHaveBeenCalledWith('run-1');
        expect(status.state).toBe('stopped');
    });
});
