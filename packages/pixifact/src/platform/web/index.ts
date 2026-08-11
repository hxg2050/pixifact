import { Application, type ApplicationOptions } from 'pixi.js';

export async function createApplication(
    options: Partial<ApplicationOptions> = {},
): Promise<Application> {
    const app = new Application();
    await app.init(options);
    return app;
}
