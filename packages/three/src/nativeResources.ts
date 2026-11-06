import { DOMAdapter } from 'pixi.js';
import { createMiniGameSubpackageLoader, decodeUtf8, encodeUtf8, miniGameResourceSubpackage, type MiniGameApi } from 'pixifact/internal/minigame';

export interface ThreeMiniGameApi extends MiniGameApi {
    env: { USER_DATA_PATH: string };
    base64ToArrayBuffer(data: string): ArrayBuffer;
    getFileSystemManager(): ReturnType<MiniGameApi['getFileSystemManager']> & {
        writeFile(options: { filePath: string; data: ArrayBuffer; success(): void; fail(error: { errMsg: string }): void }): void;
        unlink(options: { filePath: string; success(): void; fail(error: { errMsg: string }): void }): void;
    };
}

/** glTF 只需要 UTF-8 解码，复用小游戏资源层实现，不修改全局 TextDecoder。 */
export class NativeTextDecoder {
    decode(input: ArrayBuffer | ArrayBufferView) {
        const buffer = ArrayBuffer.isView(input)
            ? input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer
            : input;
        return decodeUtf8(buffer).replace(/^\uFEFF/, '');
    }
}

export class NativeBlob {
    readonly type: string;
    readonly bytes: Uint8Array;
    constructor(parts: ArrayBuffer[], options: { type?: string } = {}) {
        this.type = options.type ?? '';
        this.bytes = new Uint8Array(parts.reduce((size, part) => size + part.byteLength, 0));
        let offset = 0;
        for (const part of parts) {
            this.bytes.set(new Uint8Array(part), offset);
            offset += part.byteLength;
        }
    }
    async arrayBuffer() { return this.bytes.slice().buffer; }
}

let nextResourceId = 0;

export function createNativeThreeResources(getApi: () => ThreeMiniGameApi, platform: string) {
    const blobs = new Map<string, NativeBlob>();
    const loadPackage = createMiniGameSubpackageLoader(getApi, platform);
    const decodeData = (url: string) => {
        const comma = url.indexOf(',');
        const header = url.slice(5, comma);
        const payload = url.slice(comma + 1);
        return {
            type: header.split(';')[0],
            data: header.endsWith(';base64') ? getApi().base64ToArrayBuffer(payload) : encodeUtf8(decodeURIComponent(payload)),
        };
    };
    return {
        Blob: NativeBlob,
        TextDecoder: NativeTextDecoder,
        URL: {
            createObjectURL(blob: NativeBlob) {
                const url = `blob:pixifact-three/${++nextResourceId}`;
                blobs.set(url, blob);
                return url;
            },
            revokeObjectURL(url: string) { blobs.delete(url); },
        },
        async read(url: string): Promise<ArrayBuffer> {
            if (url.startsWith('data:')) return decodeData(url).data;
            if (url.startsWith('blob:pixifact-three/')) return blobs.get(url)!.arrayBuffer();
            const response = await DOMAdapter.get().fetch(url);
            if (!response.ok) throw new Error(`Three 资源加载失败 (${response.status}): ${url}`);
            return response.arrayBuffer();
        },
        async prepareImage(url: string): Promise<{ src: string; release?: () => Promise<void> }> {
            const pack = miniGameResourceSubpackage(url);
            if (pack) await loadPackage(pack);
            if (!url.startsWith('data:') && !url.startsWith('blob:pixifact-three/')) return { src: url };
            const embedded = url.startsWith('data:')
                ? decodeData(url)
                : { type: blobs.get(url)!.type, data: await blobs.get(url)!.arrayBuffer() };
            const extension = embedded.type.split('/')[1].replace('jpeg', 'jpg');
            const api = getApi();
            const fs = api.getFileSystemManager();
            const src = `${api.env.USER_DATA_PATH}/pixifact-three-${Date.now()}-${++nextResourceId}.${extension}`;
            await new Promise<void>((resolve, reject) => fs.writeFile({
                filePath: src, data: embedded.data, success: resolve,
                fail: (error) => reject(new Error(error.errMsg)),
            }));
            return {
                src,
                release: () => new Promise<void>((resolve, reject) => fs.unlink({
                    filePath: src, success: resolve,
                    fail: (error) => reject(new Error(error.errMsg)),
                })),
            };
        },
    };
}

export type NativeThreeResources = ReturnType<typeof createNativeThreeResources>;
