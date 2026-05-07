export interface LockSpec {
    target: 'transform' | 'component';
    node: string;
    component?: string;
    prop: string;
    reason?: string;
}

export interface OverrideSpec {
    source: 'manual' | 'ai';
    target: string;
    before: unknown;
    after: unknown;
    reason?: string;
    timestamp: number;
}

export function lockKey(lock: Omit<LockSpec, 'reason'>) {
    return lock.target === 'transform'
        ? `${lock.node}.transform.${lock.prop}`
        : `${lock.node}.${lock.component}.${lock.prop}`;
}

export function isLocked(locks: readonly LockSpec[] | undefined, candidate: Omit<LockSpec, 'reason'>) {
    return (locks ?? []).some((lock) => {
        if (lock.target !== candidate.target || lock.node !== candidate.node || lock.prop !== candidate.prop) {
            return false;
        }
        return candidate.target === 'transform' || lock.component === candidate.component;
    });
}
