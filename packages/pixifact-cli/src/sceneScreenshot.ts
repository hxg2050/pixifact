import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createEditorProjectService } from './editorServer';

interface SceneScreenshotOptions {
    projectRoot: string;
    scenePath: string;
}

interface BrowserSceneCapture {
    scenePath: string;
    revision: string;
    width: number;
    height: number;
    dataUrl: string;
}

const pngDataUrlPrefix = 'data:image/png;base64,';

export async function captureSceneScreenshot(options: SceneScreenshotOptions) {
    const staticRoot = path.resolve(import.meta.dir, '..', 'editor');
    if (!fs.existsSync(path.join(staticRoot, 'capture.html'))) {
        throw new Error('Scene screenshot frontend is not built. Run "bun run editor:frontend:build" first.');
    }
    const service = createEditorProjectService({
        projectRoot: options.projectRoot,
        staticRoot,
    });
    const token = randomBytes(32).toString('hex');
    const server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch(request) {
            if (request.headers.get('x-pixifact-capture-token') !== token) {
                return Response.json({ ok: false, error: 'Scene screenshot request is unauthorized.' }, { status: 403 });
            }
            if (request.method !== 'GET') {
                return Response.json({ ok: false, error: 'Scene screenshot service is read-only.' }, { status: 405 });
            }
            return service.fetch(request);
        },
    });
    try {
        const { chromium } = await import('playwright');
        const browser = await chromium.launch({ channel: 'chrome', headless: true });
        try {
            const origin = `http://127.0.0.1:${server.port}`;
            const context = await browser.newContext();
            await context.route('**/*', (route) => {
                if (new URL(route.request().url()).origin !== origin) return route.continue();
                return route.continue({
                    headers: {
                        ...route.request().headers(),
                        'x-pixifact-capture-token': token,
                    },
                });
            });
            const page = await context.newPage();
            await page.goto(`${origin}/capture.html`);
            let timer: ReturnType<typeof setTimeout> | undefined;
            const timeout = new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error('Scene 截图超过 60 秒仍未完成。')), 60_000);
            });
            let result: BrowserSceneCapture;
            try {
                result = await Promise.race([
                    page.evaluate((scenePath) => (
                        window as unknown as { capturePixifactScene: (path: string) => Promise<BrowserSceneCapture> }
                    ).capturePixifactScene(scenePath), options.scenePath),
                    timeout,
                ]);
            } finally {
                if (timer) clearTimeout(timer);
            }
            if (
                result.scenePath !== options.scenePath
                || !Number.isInteger(result.width)
                || result.width <= 0
                || !Number.isInteger(result.height)
                || result.height <= 0
                || !result.dataUrl.startsWith(pngDataUrlPrefix)
            ) {
                throw new Error('Scene screenshot renderer returned invalid PNG metadata.');
            }
            const data = Buffer.from(result.dataUrl.slice(pngDataUrlPrefix.length), 'base64');
            if (!data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
                throw new Error('Scene screenshot renderer did not return PNG data.');
            }
            return {
                scenePath: result.scenePath,
                revision: result.revision,
                width: result.width,
                height: result.height,
                data,
            };
        } finally {
            await browser.close();
        }
    } finally {
        server.stop(true);
    }
}
