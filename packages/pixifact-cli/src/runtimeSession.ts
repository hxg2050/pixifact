import {
    findActiveRuntimeSession,
    type RuntimeSessionDescriptor,
} from 'pixifact/compiler-node';
import type { RuntimePageDescriptor, RuntimeRequest } from 'pixifact/runtime-dev';

interface RuntimeSessionLookupOptions {
    projectRoot: string;
    sessionsRoot?: string;
    fetch?: typeof fetch;
}

interface RuntimeQueryOptions extends RuntimeSessionLookupOptions {
    runtimeId?: string;
    request: RuntimeRequest;
}

type RuntimeListResult =
    | { ok: true; runtimes: Array<RuntimePageDescriptor & { connectedAt: string }> }
    | { ok: false; error: string; [key: string]: unknown };

async function activeDescriptor(options: RuntimeSessionLookupOptions) {
    const descriptor = await findActiveRuntimeSession(options);
    if (!descriptor) {
        return {
            ok: false as const,
            error: 'No Pixifact Runtime Vite server is running for this project.',
        };
    }
    return { ok: true as const, descriptor };
}

async function runtimeHostFetch(
    descriptor: RuntimeSessionDescriptor,
    pathname: string,
    fetcher: typeof fetch,
    init: RequestInit = {},
) {
    try {
        const response = await fetcher(`${descriptor.origin}/__pixifact_runtime__/${pathname}`, {
            ...init,
            headers: {
                authorization: `Bearer ${descriptor.token}`,
                ...init.headers,
            },
        });
        return await response.json() as Record<string, unknown>;
    } catch {
        return {
            ok: false,
            error: 'Pixifact Runtime Vite server is not reachable for this project.',
        };
    }
}

export async function queryRuntimeList(
    options: RuntimeSessionLookupOptions,
): Promise<RuntimeListResult> {
    const active = await activeDescriptor(options);
    if (!active.ok) return active;
    const result = await runtimeHostFetch(active.descriptor, 'list', options.fetch ?? fetch);
    if (
        result.ok !== true
        || !Array.isArray(result.runtimes)
        || !result.runtimes.every((runtime) => (
            typeof runtime === 'object'
            && runtime !== null
            && typeof runtime.runtimeId === 'string'
            && typeof runtime.url === 'string'
            && typeof runtime.title === 'string'
            && typeof runtime.ready === 'boolean'
            && typeof runtime.connectedAt === 'string'
        ))
    ) {
        return result.ok === false && typeof result.error === 'string'
            ? result as RuntimeListResult
            : {
                ok: false,
                error: 'Pixifact Runtime Vite server returned an invalid runtime list.',
            };
    }
    return result as RuntimeListResult;
}

function selectRuntime(
    runtimes: Array<RuntimePageDescriptor & { connectedAt: string }>,
    runtimeId: string | undefined,
) {
    if (runtimeId) {
        const selected = runtimes.find((runtime) => runtime.runtimeId === runtimeId);
        return selected
            ? { ok: true as const, runtime: selected }
            : {
                ok: false as const,
                error: `Pixifact Runtime "${runtimeId}" is not connected.`,
                runtimes,
            };
    }
    if (runtimes.length === 0) {
        return {
            ok: false as const,
            error: 'No Pixifact Runtime game page is connected for this project.',
        };
    }
    if (runtimes.length > 1) {
        return {
            ok: false as const,
            error: 'Multiple Pixifact Runtime game pages are connected. Use --runtime <runtime-id>.',
            runtimes,
        };
    }
    return { ok: true as const, runtime: runtimes[0] };
}

export async function queryRuntime(options: RuntimeQueryOptions) {
    const active = await activeDescriptor(options);
    if (!active.ok) return active;
    const listed = await runtimeHostFetch(active.descriptor, 'list', options.fetch ?? fetch);
    if (listed.ok !== true || !Array.isArray(listed.runtimes)) return listed;
    const selected = selectRuntime(
        listed.runtimes as Array<RuntimePageDescriptor & { connectedAt: string }>,
        options.runtimeId,
    );
    if (!selected.ok) return selected;
    return runtimeHostFetch(active.descriptor, 'request', options.fetch ?? fetch, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            runtimeId: selected.runtime.runtimeId,
            request: options.request,
        }),
    });
}
