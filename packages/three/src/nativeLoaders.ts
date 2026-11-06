import { DOMAdapter } from 'pixi.js';
import { Cache } from 'three/src/loaders/Cache.js';
import { Loader } from 'three/src/loaders/Loader.js';
import { resources } from 'pixifact:three-platform';
import { NativeBlob, NativeTextDecoder } from './nativeResources';

type Progress = (event: ProgressEvent) => void;
type Failure = (error: unknown) => void;

/** Three 原生 Loader 协议，传输复用 Pixifact；不依赖浏览器 Request/Response/stream。 */
export class FileLoader extends Loader {
    responseType = '';
    mimeType = '';
    private generation = 0;

    load(url: string, onLoad: (data: unknown) => void, onProgress?: Progress, onError?: Failure) {
        url = this.manager.resolveURL(this.path + url);
        const generation = this.generation;
        this.manager.itemStart(url);
        void (async () => {
            try {
                let data = Cache.get(`file:${url}`);
                if (data === undefined) {
                    const buffer = await resources.read(url);
                    if (generation !== this.generation) throw new Error(`Three 资源加载已取消: ${url}`);
                    onProgress?.({ type: 'progress', lengthComputable: true, loaded: buffer.byteLength, total: buffer.byteLength } as ProgressEvent);
                    if (this.responseType === 'arraybuffer') data = buffer;
                    else if (this.responseType === 'blob') data = new NativeBlob([buffer], { type: this.mimeType });
                    else {
                        const text = new NativeTextDecoder().decode(buffer);
                        if (this.responseType === 'json') data = JSON.parse(text);
                        else if (this.responseType === 'document') data = new DOMParser().parseFromString(text, this.mimeType as DOMParserSupportedType);
                        else data = text;
                    }
                    Cache.add(`file:${url}`, data);
                }
                onLoad?.(data);
            } catch (error) {
                if (onError) onError(error);
                else console.error(error);
                this.manager.itemError(url);
            } finally {
                this.manager.itemEnd(url);
            }
        })();
    }
    setResponseType(value: string) { this.responseType = value; return this; }
    setMimeType(value: string) { this.mimeType = value; return this; }
    abort() { this.generation++; return this; }
}

export class ImageLoader extends Loader<HTMLImageElement> {
    load(url: string, onLoad: (image: HTMLImageElement) => void, _onProgress?: Progress, onError?: Failure) {
        url = this.manager.resolveURL(this.path + url);
        const image = DOMAdapter.get().createImage() as HTMLImageElement;
        image.crossOrigin = this.crossOrigin;
        this.manager.itemStart(url);
        void (async () => {
            try {
                const prepared = await resources.prepareImage(url);
                try {
                    await new Promise<void>((resolve, reject) => {
                        image.onload = () => resolve();
                        image.onerror = reject;
                        image.src = prepared.src;
                    });
                } finally {
                    await prepared.release?.();
                }
                onLoad?.(image);
            } catch (error) {
                if (onError) onError(error);
                else console.error(error);
                this.manager.itemError(url);
            } finally {
                image.onload = null;
                image.onerror = null;
                this.manager.itemEnd(url);
            }
        })();
        return image;
    }
}
