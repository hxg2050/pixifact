import {
    pixifactViewportModes,
    type PixifactViewportConfig,
    type PixifactViewportMode,
} from '../viewport';

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
    version: 2;
    name: string;
    resolution: PixifactProjectResolution;
    viewport: PixifactProjectViewport;
    scenes: Record<string, string>;
    resourcePacks?: string[];
    remoteResourcePacks?: Record<string, string>;
    run?: PixifactProjectRunConfig;
}

export type PixifactProjectViewport = PixifactViewportConfig;

export interface PixifactProjectSummary {
    name: string;
    resolution: PixifactProjectResolution;
    viewport: PixifactProjectViewport;
    scenes: Record<string, string>;
    resourcePacks?: string[];
    remoteResourcePacks?: Record<string, string>;
    run?: PixifactProjectRunConfig;
}

export const defaultPixifactProjectResolution: PixifactProjectResolution = {
    width: 750,
    height: 1334,
};

export const defaultPixifactProjectViewport: PixifactProjectViewport = {
    mode: 'showAll',
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

function parseViewport(value: unknown): PixifactProjectViewport {
    if (value === undefined) {
        return defaultPixifactProjectViewport;
    }
    const viewport = assertRecord(value, 'viewport');
    const mode = assertString(viewport.mode, 'viewport.mode');
    if (!isPixifactViewportMode(mode)) {
        throw new Error(`viewport.mode must be one of ${pixifactViewportModes.join(', ')}`);
    }
    return {
        mode,
    };
}

function isPixifactViewportMode(value: string): value is PixifactViewportMode {
    return (pixifactViewportModes as readonly string[]).includes(value);
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

function parseResourcePacks(value: unknown): string[] | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (!Array.isArray(value) || !value.every((name) => typeof name === 'string')) {
        throw new Error('resourcePacks must be an array of strings.');
    }
    const packs = value.map((name, index) => {
        const normalized = normalizeProjectPath(name, `resourcePacks.${index}`);
        if (normalized.includes('/')) {
            throw new Error(`resourcePacks.${index} must be a directory name.`);
        }
        return normalized;
    });
    if (new Set(packs).size !== packs.length) {
        throw new Error('resourcePacks must not contain duplicate names.');
    }
    return packs;
}

function parseRemoteResourcePacks(value: unknown, resourcePacks: string[] | undefined) {
    if (value === undefined) {
        return undefined;
    }
    const packs = assertRecord(value, 'remoteResourcePacks');
    return Object.fromEntries(Object.entries(packs).map(([rawName, rawBaseUrl]) => {
        const name = assertString(rawName, 'remote resource pack name');
        if (!resourcePacks?.includes(name)) {
            throw new Error(`remoteResourcePacks.${name} must reference resourcePacks.`);
        }
        const baseUrl = assertString(rawBaseUrl, `remoteResourcePacks.${name}`).replace(/\/+$/, '');
        let url: URL;
        try {
            url = new URL(baseUrl);
        } catch {
            throw new Error(`remoteResourcePacks.${name} must be an HTTPS URL.`);
        }
        if (url.protocol !== 'https:' || url.hostname === '') {
            throw new Error(`remoteResourcePacks.${name} must be an HTTPS URL.`);
        }
        return [name, baseUrl];
    }));
}

export function parsePixifactProjectConfig(value: unknown): PixifactProjectConfig {
    const config = assertRecord(value, 'pixifact.project.json');
    if (config.version !== 2) {
        throw new Error('pixifact.project.json version must be 2.');
    }
    if (config.targets !== undefined) {
        throw new Error('targets is not supported in pixifact.project.json version 2.');
    }
    if (config.defines !== undefined) {
        throw new Error('defines is not supported in pixifact.project.json version 2.');
    }
    const resourcePacks = parseResourcePacks(config.resourcePacks);
    const remoteResourcePacks = parseRemoteResourcePacks(config.remoteResourcePacks, resourcePacks);
    return {
        version: 2,
        name: assertString(config.name, 'name'),
        resolution: parseResolution(config.resolution),
        viewport: parseViewport(config.viewport),
        scenes: parseScenes(config.scenes),
        ...(resourcePacks === undefined ? {} : { resourcePacks }),
        ...(remoteResourcePacks === undefined ? {} : { remoteResourcePacks }),
        run: parseRun(config.run),
    };
}

export function summarizePixifactProjectConfig(config: PixifactProjectConfig): PixifactProjectSummary {
    return {
        name: config.name,
        resolution: config.resolution,
        viewport: config.viewport,
        scenes: config.scenes,
        ...(config.resourcePacks === undefined ? {} : { resourcePacks: config.resourcePacks }),
        ...(config.remoteResourcePacks === undefined ? {} : { remoteResourcePacks: config.remoteResourcePacks }),
        ...(config.run === undefined ? {} : { run: config.run }),
    };
}
