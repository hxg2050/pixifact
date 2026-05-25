import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface PixifactScenesPluginOptions {
    projectRoot?: string | URL;
    generatedDir?: string;
}

function projectRootPath(projectRoot: string | URL | undefined) {
    if (typeof projectRoot === 'string') {
        return projectRoot;
    }
    if (projectRoot) {
        return fileURLToPath(projectRoot);
    }
    return process.cwd();
}

export function pixifactScenesPlugin(options: PixifactScenesPluginOptions = {}) {
    const generatedDir = path.resolve(projectRootPath(options.projectRoot), options.generatedDir ?? '.pixifact/generated');
    const sceneRegistry = path.join(generatedDir, 'scenes.generated.ts');

    return {
        name: 'pixifact-scenes',
        resolveId(id: string) {
            return id === 'pixifact:scenes' ? sceneRegistry : undefined;
        },
    };
}
