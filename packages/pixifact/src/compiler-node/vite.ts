import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatedSceneAssetsFileName } from '../compiler/compileScenes';

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
    const projectRoot = projectRootPath(options.projectRoot);
    const generatedDir = path.resolve(projectRoot, options.generatedDir ?? '.pixifact/generated');
    const sceneRegistry = path.join(generatedDir, 'scenes.generated.ts');
    const sceneAssets = path.join(generatedDir, generatedSceneAssetsFileName);
    const virtualSceneRegistry = '\0pixifact:scenes';

    return {
        name: 'pixifact-scenes',
        resolveId(id: string) {
            return id === 'pixifact:scenes' ? virtualSceneRegistry : undefined;
        },
        async load(id: string) {
            if (id !== virtualSceneRegistry) {
                return undefined;
            }
            const assets = JSON.parse(await readFile(sceneAssets, 'utf8')) as string[];
            const imports = assets.map((asset, index) =>
                `import __pixifactAsset${index + 1} from ${JSON.stringify(viteFileImport(path.resolve(projectRoot, asset), '?url'))};`
            );
            const manifest = Object.fromEntries(assets.map((asset, index) => [
                asset,
                { src: `__pixifactAsset${index + 1}` },
            ]));
            const manifestSource = JSON.stringify(manifest, null, 2)
                .replace(/"src": "(__pixifactAsset\d+)"/g, '"src": $1');
            return [
                ...imports,
                "import { configureSceneAssets } from 'pixifact/scene';",
                `import ${JSON.stringify(viteFileImport(sceneRegistry))};`,
                `configureSceneAssets(${manifestSource});`,
            ].join('\n');
        },
    };
}

function viteFileImport(filePath: string, suffix = '') {
    return `/@fs/${filePath.replaceAll(path.sep, '/')}${suffix}`;
}
