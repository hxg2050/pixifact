import { wechatApi } from './types';

class WechatResponseHeaders {
    private readonly values: Map<string, string>;

    constructor(headers: Record<string, string>) {
        this.values = new Map(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), String(value)]));
    }

    get(name: string) {
        return this.values.get(name.toLowerCase()) ?? null;
    }
}

class WechatResourceResponse {
    readonly body = null;
    readonly bodyUsed = false;
    readonly ok: boolean;
    readonly redirected = false;
    readonly statusText = '';
    readonly type = 'basic';
    readonly headers: WechatResponseHeaders;

    constructor(
        private readonly responseBody: ArrayBuffer,
        readonly status: number,
        readonly url: string,
        responseHeaders: Record<string, string> = {},
    ) {
        this.ok = status >= 200 && status < 300;
        this.headers = new WechatResponseHeaders(responseHeaders);
    }

    async arrayBuffer() {
        return this.responseBody.slice(0);
    }

    async blob(): Promise<Blob> {
        throw new Error('Blob responses are not supported by the WeChat resource adapter.');
    }

    clone() {
        return new WechatResourceResponse(this.responseBody.slice(0), this.status, this.url);
    }

    async formData(): Promise<FormData> {
        throw new Error('FormData responses are not supported by the WeChat resource adapter.');
    }

    async json(): Promise<unknown> {
        return JSON.parse((await this.text()).replace(/^\uFEFF/, ''));
    }

    async text() {
        return new TextDecoder().decode(this.responseBody);
    }
}

function toArrayBuffer(data: unknown) {
    if (data instanceof ArrayBuffer) {
        return data;
    }
    if (ArrayBuffer.isView(data)) {
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    }
    return new TextEncoder().encode(typeof data === 'string' ? data : JSON.stringify(data)).buffer;
}

function requestUrl(input: RequestInfo | URL) {
    return typeof input === 'string' ? input : ((input as { url?: string }).url ?? String(input));
}

function localPath(url: string) {
    const suffix = url.search(/[?#]/);
    return (suffix >= 0 ? url.slice(0, suffix) : url).replace(/^(\.\/)+/, '');
}

export function fetchWechatResource(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const method = (init.method ?? 'GET').toUpperCase();
    const url = requestUrl(input);
    if (method !== 'GET') {
        return Promise.reject(new Error(`The WeChat resource adapter only supports GET requests, received ${method}.`));
    }
    if (init.signal?.aborted) {
        return Promise.reject(new Error(`Resource request was aborted: ${url}`));
    }
    const wx = wechatApi();
    if (/^https?:\/\//i.test(url)) {
        return new Promise((resolve, reject) => wx.request({
            url,
            method: 'GET',
            responseType: 'arraybuffer',
            fail: (error) => reject(new Error(`Failed to request ${url}: ${error.errMsg}`)),
            success: (result) => resolve(new WechatResourceResponse(
                toArrayBuffer(result.data),
                result.statusCode,
                url,
                result.header,
            ) as unknown as Response),
        }));
    }
    if (/^data:/i.test(url)) {
        return Promise.reject(new Error('Data URLs are not supported by the WeChat resource adapter.'));
    }
    const filePath = localPath(url);
    return new Promise((resolve, reject) => wx.getFileSystemManager().readFile({
        filePath,
        fail: (error) => reject(new Error(`Failed to read ${filePath}: ${error.errMsg}`)),
        success: (result) => resolve(new WechatResourceResponse(
            toArrayBuffer(result.data),
            200,
            url,
        ) as unknown as Response),
    }));
}
