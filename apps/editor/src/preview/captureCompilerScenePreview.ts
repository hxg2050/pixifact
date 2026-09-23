import { Rectangle, type Application } from 'pixi.js';
import type { CompilerSceneRuntimePreview } from './compilerSceneRuntimePreview';

export function captureCompilerScenePreview(app: Application, preview: CompilerSceneRuntimePreview) {
    const position = preview.root.position.clone();
    const scale = preview.root.scale.clone();
    let dataUrlPromise: Promise<string>;
    try {
        preview.root.position.set(0, 0);
        preview.root.scale.set(1);
        dataUrlPromise = app.renderer.extract.base64({
            target: preview.root,
            frame: new Rectangle(0, 0, preview.width, preview.height),
            resolution: 1,
            format: 'png',
            antialias: true,
        });
    } finally {
        preview.root.position.copyFrom(position);
        preview.root.scale.copyFrom(scale);
    }
    return dataUrlPromise;
}
