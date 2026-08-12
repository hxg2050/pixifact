import {
    checkDataUrl,
    checkExtension,
    createTexture,
    extensions,
    ExtensionType,
    getResolutionOfUrl,
    ImageSource,
    LoaderParserPriority,
    type ImageResource,
    type Loader,
    type ResolvedAsset,
    type Texture,
    type TextureSourceOptions,
} from 'pixi.js';
import type { DouyinImage } from './types';
import { douyinApi } from './types';

const validImageExtensions = ['.jpeg', '.jpg', '.png', '.webp', '.avif'];
const validImageMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const douyinImageLoaderId = 'pixifact-douyin-image';

const douyinImageLoader = {
    extension: {
        type: ExtensionType.LoadParser,
        priority: LoaderParserPriority.High + 1,
        name: 'loadDouyinTextures',
    },
    id: douyinImageLoaderId,
    test(url: string) {
        return checkDataUrl(url, validImageMimes) || checkExtension(url, validImageExtensions);
    },
    async load(
        url: string,
        asset: ResolvedAsset<TextureSourceOptions>,
        loader: Loader,
    ) {
        const image = await loadDouyinImage(url);
        const { width, height } = image;

        if (!isPositiveDimension(width) || !isPositiveDimension(height)) {
            throw new Error(`[pixifact-douyin] Loaded image has no usable size: ${url}`);
        }

        const resolution = asset.data?.resolution || getResolutionOfUrl(url);
        const source = new ImageSource({
            alphaMode: 'premultiply-alpha-on-upload',
            resolution,
            ...asset.data,
            resource: image as unknown as ImageResource,
            width: width / resolution,
            height: height / resolution,
        });

        return createTexture(source, loader, url);
    },
    unload(texture: Texture) {
        texture.destroy(true);
    },
};

export function installDouyinImageAssets() {
    extensions.add(douyinImageLoader);
}

function loadDouyinImage(url: string): Promise<DouyinImage> {
    const image = douyinApi().createImage();

    return new Promise((resolve, reject) => {
        image.onload = () => {
            clearImageHandlers(image);
            resolve(image);
        };
        image.onerror = () => {
            clearImageHandlers(image);
            reject(new Error(`[pixifact-douyin] Failed to load image: ${url}`));
        };
        image.src = url;
    });
}

function clearImageHandlers(image: DouyinImage) {
    image.onload = null;
    image.onerror = null;
}

function isPositiveDimension(value: number) {
    return Number.isFinite(value) && value > 0;
}
