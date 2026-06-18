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

export interface SceneViewProfileRow {
    averageMs: number;
    count: number;
    label: string;
    maxMs: number;
    totalMs: number;
}

export interface SceneViewProfileSummary {
    durationMs: number;
    meta?: Record<string, unknown>;
    name: string;
    rows: SceneViewProfileRow[];
}

export interface SceneViewProfileNote {
    label: string;
    meta?: Record<string, unknown>;
}

export interface SceneViewProfilerSnapshot {
    enabled: boolean;
    lastNote?: SceneViewProfileNote;
    lastSummary?: SceneViewProfileSummary;
}

const profileFlag = '__PIXIFACT_SCENE_VIEW_PROFILE__';
const profileStorageKey = 'pixifact.sceneViewProfile';

let nextProfileId = 0;
let activeSession: SceneViewProfileSession | undefined;
let lastNote: SceneViewProfileNote | undefined;
let lastSummary: SceneViewProfileSummary | undefined;
let currentSnapshot: SceneViewProfilerSnapshot | undefined;
const listeners = new Set<() => void>();

function now() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function profilerGlobal() {
    return globalThis as typeof globalThis & {
        [profileFlag]?: boolean;
        pixifactSceneViewProfile?: {
            disable: () => void;
            enable: () => void;
            last: () => SceneViewProfileSummary | undefined;
            status: () => SceneViewProfilerSnapshot;
        };
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

function emitSceneViewProfilerChange() {
    currentSnapshot = {
        enabled: sceneViewProfilerEnabled(),
        lastNote,
        lastSummary,
    };
    for (const listener of listeners) {
        listener();
    }
}

export function getSceneViewProfilerSnapshot(): SceneViewProfilerSnapshot {
    const enabled = sceneViewProfilerEnabled();
    if (
        !currentSnapshot
        || currentSnapshot.enabled !== enabled
        || currentSnapshot.lastNote !== lastNote
        || currentSnapshot.lastSummary !== lastSummary
    ) {
        currentSnapshot = {
            enabled,
            lastNote,
            lastSummary,
        };
    }
    return currentSnapshot;
}

export function subscribeSceneViewProfiler(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function enableSceneViewProfiler() {
    profilerGlobal()[profileFlag] = true;
    try {
        localStorage.setItem(profileStorageKey, '1');
    } catch {
        // Ignore storage failures; the global flag still enables profiling for this session.
    }
    emitSceneViewProfilerChange();
    console.info('[Pixifact SceneView] profiling enabled');
}

export function disableSceneViewProfiler() {
    profilerGlobal()[profileFlag] = false;
    try {
        localStorage.removeItem(profileStorageKey);
    } catch {
        // Ignore storage failures; the global flag still disables profiling for this session.
    }
    emitSceneViewProfilerChange();
    console.info('[Pixifact SceneView] profiling disabled');
}

function installSceneViewProfilerConsoleApi() {
    const target = profilerGlobal();
    target.pixifactSceneViewProfile = {
        disable: disableSceneViewProfiler,
        enable: enableSceneViewProfiler,
        last: () => lastSummary,
        status: getSceneViewProfilerSnapshot,
    };
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
    console.info(`[Pixifact SceneView] ${name} profile started`, meta ?? {});
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
    lastSummary = {
        durationMs: Number(durationMs.toFixed(2)),
        meta: {
            ...session.meta,
            ...meta,
        },
        name: session.name,
        rows,
    };
    emitSceneViewProfilerChange();

    console.info(`[Pixifact SceneView] ${session.name} profile finished ${durationMs.toFixed(2)}ms`, lastSummary.meta ?? {});
    console.table(rows);
}

export function noteSceneViewProfile(label: string, meta?: Record<string, unknown>) {
    if (!sceneViewProfilerEnabled()) {
        return;
    }
    lastNote = { label, meta };
    emitSceneViewProfilerChange();
    console.info(`[Pixifact SceneView] ${label}`, meta ?? {});
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

installSceneViewProfilerConsoleApi();

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
