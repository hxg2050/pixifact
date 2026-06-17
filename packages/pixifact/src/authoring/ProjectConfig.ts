export const pixifactProjectConfigFileName = 'pixifact.project.json';

export interface PixifactProjectRunConfig {
    command: string;
    args: string[];
    cwd: string;
    url?: string;
}

export interface PixifactProjectResolution {
    width: number;
    height: number;
}

export interface PixifactProjectConfig {
    version: 1;
    name: string;
    resolution: PixifactProjectResolution;
    scenes: Record<string, string>;
    run?: PixifactProjectRunConfig;
}

export interface PixifactProjectSummary {
    name: string;
    resolution: PixifactProjectResolution;
    scenes: Record<string, string>;
    run?: PixifactProjectRunConfig;
}

export const defaultPixifactProjectResolution: PixifactProjectResolution = {
    width: 750,
    height: 1334,
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertRecord(value: unknown, name: string) {
    if (!isRecord(value)) {
        throw new Error(`${name} must be an object.`);
    }
    return value;
}

function assertString(value: unknown, name: string) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`${name} must be a non-empty string.`);
    }
    return value.trim();
}

function assertPositiveNumber(value: unknown, name: string) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new Error(`${name} must be a positive number.`);
    }
    return value;
}

function normalizeProjectPath(value: unknown, name: string) {
    const input = assertString(value, name).replaceAll('\\', '/');
    if (input.startsWith('/') || /^[A-Za-z]:\//.test(input)) {
        throw new Error(`${name} must be project-relative.`);
    }
    const parts = input.split('/');
    if (parts.some((part) => part === '..')) {
        throw new Error(`${name} must stay inside projectRoot.`);
    }
    if (parts.some((part) => part === '')) {
        throw new Error(`${name} must not contain empty path segments.`);
    }
    return input;
}

function normalizeRunCwd(value: unknown) {
    const input = assertString(value, 'run.cwd').replaceAll('\\', '/');
    if (input === '.') {
        return input;
    }
    return normalizeProjectPath(input, 'run.cwd');
}

function parseScenes(value: unknown) {
    const scenes = assertRecord(value, 'scenes');
    return Object.fromEntries(Object.entries(scenes).map(([key, scenePath]) => [
        assertString(key, 'scene key'),
        normalizeProjectPath(scenePath, `scenes.${key}`),
    ]));
}

function parseResolution(value: unknown): PixifactProjectResolution {
    if (value === undefined) {
        return defaultPixifactProjectResolution;
    }
    const resolution = assertRecord(value, 'resolution');
    return {
        width: assertPositiveNumber(resolution.width, 'resolution.width'),
        height: assertPositiveNumber(resolution.height, 'resolution.height'),
    };
}

function parseRun(value: unknown): PixifactProjectRunConfig | undefined {
    if (value === undefined) {
        return undefined;
    }
    const run = assertRecord(value, 'run');
    if (!Array.isArray(run.args) || !run.args.every((arg) => typeof arg === 'string')) {
        throw new Error('run.args must be an array of strings.');
    }
    return {
        command: assertString(run.command, 'run.command'),
        args: run.args,
        cwd: normalizeRunCwd(run.cwd),
        ...(run.url === undefined ? {} : { url: assertString(run.url, 'run.url') }),
    };
}

export function parsePixifactProjectConfig(value: unknown): PixifactProjectConfig {
    const config = assertRecord(value, 'pixifact.project.json');
    if (config.version !== 1) {
        throw new Error('pixifact.project.json version must be 1.');
    }
    return {
        version: 1,
        name: assertString(config.name, 'name'),
        resolution: parseResolution(config.resolution),
        scenes: parseScenes(config.scenes),
        run: parseRun(config.run),
    };
}

export function summarizePixifactProjectConfig(config: PixifactProjectConfig): PixifactProjectSummary {
    return {
        name: config.name,
        resolution: config.resolution,
        scenes: config.scenes,
        ...(config.run === undefined ? {} : { run: config.run }),
    };
}
