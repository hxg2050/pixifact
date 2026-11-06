import { loadPixifactEnv, type PixifactPlatform } from 'pixifact/compiler-node';
import type { Plugin } from 'vite';

const platformModule = 'pixifact:three-platform';
const virtualPlatform = '\0' + platformModule;

/** 与 pixifact() 一起注册，小游戏端局部适配 Three r186 资源加载。 */
export function three(): Plugin {
    let platform: PixifactPlatform;
    return {
        name: 'pixifact-three',
        enforce: 'pre',
        config() { return { resolve: { dedupe: ['pixi.js', 'three', '@pixifact/three'] } }; },
        configResolved(config) { platform = loadPixifactEnv(config.root, config.mode).platform; },
        async resolveId(id, importer) {
            if (platform === 'web') return;
            if (id === platformModule) return virtualPlatform;
            // Three 的 build 入口将 loader 内联；使用同一份源码模块，保留可替换的 loader 边界。
            if (id === 'three') return this.resolve('three/src/Three.js', importer, { skipSelf: true });
            return undefined;
        },
        load(id) {
            if (id !== virtualPlatform) return;
            return `import { createNativeThreeResources } from '@pixifact/three/internal/resources';
export const resources = createNativeThreeResources(() => ${platform === 'wechat' ? 'wx' : 'tt'}, ${JSON.stringify(platform)});`;
        },
        transform(code, id) {
            if (platform === 'web') return;
            const source = id.replaceAll('\\', '/').split('?')[0];
            const loader = source.match(/\/three\/src\/loaders\/(FileLoader|ImageLoader)\.js$/)?.[1];
            if (loader) return { code: `export { ${loader} } from '@pixifact/three/internal/loaders';`, map: null };
            if (source.endsWith('/three/examples/jsm/loaders/GLTFLoader.js')) {
                return {
                    code: `import { resources as __pixifactResources } from '${platformModule}';
const Blob = __pixifactResources.Blob;
const TextDecoder = __pixifactResources.TextDecoder;
const self = { URL: __pixifactResources.URL };
const createImageBitmap = undefined;
${code}`,
                    map: null,
                };
            }
            return undefined;
        },
    };
}
