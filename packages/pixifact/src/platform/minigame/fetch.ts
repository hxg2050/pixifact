import type { MiniGameApi, MiniGameFetch } from './types';

class MiniGameResponseHeaders {
    private readonly values: Map<string, string>;

    constructor(headers: Record<string, string>) {
        this.values = new Map(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), String(value)]));
    }

    get(name: string) {
        return this.values.get(name.toLowerCase()) ?? null;
    }
}

type MiniGameResponseBody = ArrayBuffer | string;

function decodeUtf8(buffer: ArrayBuffer) {
    const bytes = new Uint8Array(buffer);
    let output = '';
    for (let index = 0; index < bytes.length;) {
        const first = bytes[index++];
        let codePoint: number;
        if (first < 0x80) {
            codePoint = first;
        } else if (first < 0xe0) {
            codePoint = ((first & 0x1f) << 6) | (bytes[index++] & 0x3f);
        } else if (first < 0xf0) {
            codePoint = ((first & 0x0f) << 12)
                | ((bytes[index++] & 0x3f) << 6)
                | (bytes[index++] & 0x3f);
        } else {
            codePoint = ((first & 0x07) << 18)
                | ((bytes[index++] & 0x3f) << 12)
                | ((bytes[index++] & 0x3f) << 6)
                | (bytes[index++] & 0x3f);
        }
        output += String.fromCodePoint(codePoint);
    }
    return output;
}

function encodeUtf8(value: string) {
    const bytes: number[] = [];
    for (const character of value) {
        const codePoint = character.codePointAt(0)!;
        if (codePoint < 0x80) {
            bytes.push(codePoint);
        } else if (codePoint < 0x800) {
            bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
        } else if (codePoint < 0x10000) {
            bytes.push(
                0xe0 | (codePoint >> 12),
                0x80 | ((codePoint >> 6) & 0x3f),
                0x80 | (codePoint & 0x3f),
            );
        } else {
            bytes.push(
                0xf0 | (codePoint >> 18),
                0x80 | ((codePoint >> 12) & 0x3f),
                0x80 | ((codePoint >> 6) & 0x3f),
                0x80 | (codePoint & 0x3f),
            );
        }
    }
    return new Uint8Array(bytes).buffer;
}

class MiniGameResourceResponse {
    readonly body = null;
    readonly bodyUsed = false;
    readonly ok: boolean;
    readonly redirected = false;
    readonly statusText = '';
    readonly type = 'basic';
    readonly headers: MiniGameResponseHeaders;

    constructor(
        private readonly responseBody: MiniGameResponseBody,
        readonly status: number,
        readonly url: string,
        responseHeaders: Record<string, string> = {},
    ) {
        this.ok = status >= 200 && status < 300;
        this.headers = new MiniGameResponseHeaders(responseHeaders);
    }

    async arrayBuffer() {
        return typeof this.responseBody === 'string'
            ? encodeUtf8(this.responseBody)
            : this.responseBody.slice(0);
    }

    async blob(): Promise<Blob> {
        throw new Error('Blob responses are not supported by the Mini Game resource adapter.');
    }

    clone() {
        const body = typeof this.responseBody === 'string'
            ? this.responseBody
            : this.responseBody.slice(0);
        return new MiniGameResourceResponse(body, this.status, this.url);
    }

    async formData(): Promise<FormData> {
        throw new Error('FormData responses are not supported by the Mini Game resource adapter.');
    }

    async json(): Promise<unknown> {
        return JSON.parse((await this.text()).replace(/^\uFEFF/, ''));
    }

    async text() {
        return typeof this.responseBody === 'string'
            ? this.responseBody
            : decodeUtf8(this.responseBody);
    }
}

function toResponseBody(data: unknown): MiniGameResponseBody {
    if (data instanceof ArrayBuffer) {
        return data;
    }
    if (ArrayBuffer.isView(data)) {
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    }
    return typeof data === 'string' ? data : JSON.stringify(data);
}

function requestUrl(input: RequestInfo | URL) {
    return typeof input === 'string' ? input : ((input as { url?: string }).url ?? String(input));
}

function localPath(url: string) {
    const suffix = url.search(/[?#]/);
    return (suffix >= 0 ? url.slice(0, suffix) : url).replace(/^(\.\/)+/, '');
}

export function fetchMiniGameResource(
    api: MiniGameApi,
    input: RequestInfo | URL,
    init: RequestInit = {},
    platformName: string,
): ReturnType<MiniGameFetch> {
    const method = (init.method ?? 'GET').toUpperCase();
    const url = requestUrl(input);
    if (method !== 'GET') {
        return Promise.reject(new Error(`The ${platformName} resource adapter only supports GET requests, received ${method}.`));
    }
    if (init.signal?.aborted) {
        return Promise.reject(new Error(`Resource request was aborted: ${url}`));
    }
    if (/^https?:\/\//i.test(url)) {
        return new Promise((resolve, reject) => api.request({
            url,
            method: 'GET',
            responseType: 'arraybuffer',
            fail: (error) => reject(new Error(`Failed to request ${url}: ${error.errMsg}`)),
            success: (result) => resolve(new MiniGameResourceResponse(
                toResponseBody(result.data),
                result.statusCode,
                url,
                result.header,
            ) as unknown as Response),
        }));
    }
    if (/^data:/i.test(url)) {
        return Promise.reject(new Error(`Data URLs are not supported by the ${platformName} resource adapter.`));
    }
    const filePath = localPath(url);
    return new Promise((resolve, reject) => api.getFileSystemManager().readFile({
        filePath,
        fail: (error) => reject(new Error(`Failed to read ${filePath}: ${error.errMsg}`)),
        success: (result) => resolve(new MiniGameResourceResponse(
            toResponseBody(result.data),
            200,
            url,
        ) as unknown as Response),
    }));
}
