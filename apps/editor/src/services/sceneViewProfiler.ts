interface SceneViewProfileMetric {
    count: number;
    maxMs: number;
    totalMs: number;
}

interface SceneViewProfileSession {
    id: number;
    meta?: Record<string, unknown>;
    metrics: Map<string, SceneViewProfileMetric>;
    name: string;
    startedAt: number;
}

const profileFlag = '__PIXIFACT_SCENE_VIEW_PROFILE__';
const profileStorageKey = 'pixifact.sceneViewProfile';

let nextProfileId = 0;
let activeSession: SceneViewProfileSession | undefined;

function now() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function profilerGlobal() {
    return globalThis as typeof globalThis & {
        [profileFlag]?: boolean;
    };
}

export function sceneViewProfilerEnabled() {
    if (profilerGlobal()[profileFlag]) {
        return true;
    }
    try {
        return typeof localStorage !== 'undefined' && localStorage.getItem(profileStorageKey) === '1';
    } catch {
        return false;
    }
}

function metricFor(session: SceneViewProfileSession, label: string) {
    const current = session.metrics.get(label);
    if (current) {
        return current;
    }
    const metric = {
        count: 0,
        maxMs: 0,
        totalMs: 0,
    };
    session.metrics.set(label, metric);
    return metric;
}

function record(session: SceneViewProfileSession | undefined, label: string, durationMs = 0) {
    if (!session) {
        return;
    }
    const metric = metricFor(session, label);
    metric.count += 1;
    metric.totalMs += durationMs;
    metric.maxMs = Math.max(metric.maxMs, durationMs);
}

export function beginSceneViewProfile(name: string, meta?: Record<string, unknown>) {
    if (!sceneViewProfilerEnabled()) {
        return undefined;
    }
    nextProfileId += 1;
    activeSession = {
        id: nextProfileId,
        meta,
        metrics: new Map(),
        name,
        startedAt: now(),
    };
    return activeSession.id;
}

export function endSceneViewProfile(id: number | undefined, meta?: Record<string, unknown>) {
    if (!id || !activeSession || activeSession.id !== id) {
        return;
    }
    const session = activeSession;
    activeSession = undefined;
    const durationMs = now() - session.startedAt;
    const rows = [...session.metrics.entries()]
        .map(([label, metric]) => ({
            label,
            count: metric.count,
            totalMs: Number(metric.totalMs.toFixed(2)),
            averageMs: Number((metric.totalMs / Math.max(1, metric.count)).toFixed(2)),
            maxMs: Number(metric.maxMs.toFixed(2)),
        }))
        .sort((left, right) => right.totalMs - left.totalMs || right.count - left.count);

    console.groupCollapsed(`[Pixifact SceneView] ${session.name} ${durationMs.toFixed(2)}ms`);
    if (session.meta || meta) {
        console.log({
            ...session.meta,
            ...meta,
        });
    }
    console.table(rows);
    console.groupEnd();
}

export function countSceneViewProfile(label: string) {
    if (!sceneViewProfilerEnabled()) {
        return;
    }
    record(activeSession, label);
}

export function measureSceneViewProfile<T>(label: string, fn: () => T): T {
    if (!sceneViewProfilerEnabled()) {
        return fn();
    }
    const session = activeSession;
    const startedAt = now();
    try {
        return fn();
    } finally {
        record(session, label, now() - startedAt);
    }
}

export async function measureSceneViewProfileAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
    if (!sceneViewProfilerEnabled()) {
        return fn();
    }
    const session = activeSession;
    const startedAt = now();
    try {
        return await fn();
    } finally {
        record(session, label, now() - startedAt);
    }
}
