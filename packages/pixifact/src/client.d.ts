declare module 'pixifact:platform' {
    import type { Application, ApplicationOptions } from 'pixi.js';

    export function createApplication(
        options?: Partial<ApplicationOptions>,
    ): Promise<Application>;
}

declare module 'pixifact:assets' {
    import type { AssetsManifest } from 'pixi.js';

    const manifest: AssetsManifest;
    export default manifest;
}

interface ImportMetaEnv {
    readonly VITE_APP_ID?: string;
    readonly VITE_PLATFORM: 'web' | 'wechat' | 'douyin';
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
