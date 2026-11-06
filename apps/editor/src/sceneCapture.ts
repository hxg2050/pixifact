import { Application } from 'pixi.js';
import { parseSceneTemplate } from 'pixifact/compiler';
import { captureCompilerScenePreview } from './preview/captureCompilerScenePreview';
import {
    createCompilerSceneRuntimePreview,
    destroyCompilerSceneRuntimePreview,
    CompilerScenePreviewCache,
    type CompilerSceneRuntimePreview,
} from './preview/compilerSceneRuntimePreview';
import { createEditorProjectTree, readEditorProject, readEditorScene } from './services/editorApi';

interface SceneCaptureResult {
    scenePath: string;
    revision: string;
    width: number;
    height: number;
    dataUrl: string;
}

declare global {
    interface Window {
        capturePixifactScene(scenePath: string): Promise<SceneCaptureResult>;
    }
}

window.capturePixifactScene = async (scenePath) => {
    const [project, scene] = await Promise.all([
        readEditorProject(),
        readEditorScene(scenePath),
    ]);
    const cache = new CompilerScenePreviewCache();
    let preview: CompilerSceneRuntimePreview | undefined;
    const app = new Application();
    let initialized = false;
    try {
        preview = await createCompilerSceneRuntimePreview({
            cache,
            document: {
                template: parseSceneTemplate(scene.source),
                sceneInterfaces: {},
            },
            projectTree: createEditorProjectTree(project),
            scenePath,
        });
        await app.init({
            width: preview.width,
            height: preview.height,
            backgroundAlpha: 0,
            antialias: true,
            autoStart: false,
            resolution: 1,
        });
        initialized = true;
        app.stage.addChild(preview.root);
        return {
            scenePath: scene.path,
            revision: scene.version,
            width: preview.width,
            height: preview.height,
            dataUrl: await captureCompilerScenePreview(app, preview),
        };
    } finally {
        if (initialized) {
            app.stage.removeChild(preview!.root);
            app.destroy({ removeView: true }, { children: false });
        }
        destroyCompilerSceneRuntimePreview(preview);
        await cache.clear();
    }
};
