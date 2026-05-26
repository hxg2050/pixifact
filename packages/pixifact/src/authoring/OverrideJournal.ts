export interface LockSpec {
    target: 'transform' | 'component' | 'nodeData';
    node: string;
    field?: string;
    component?: string;
    prop: string;
    reason?: string;
}

export interface OverrideSpec {
    source: 'manual' | 'agent';
    target: string;
    before: unknown;
    after: unknown;
    reason?: string;
    timestamp: number;
}

export function lockKey(lock: Omit<LockSpec, 'reason'>) {
    if (lock.target === 'transform') {
        return `${lock.node}.transform.${lock.prop}`;
    }
    if (lock.target === 'nodeData') {
        return `${lock.node}.${lock.field}.${lock.prop}`;
    }
    return `${lock.node}.${lock.component}.${lock.prop}`;
}

export function isLocked(locks: readonly LockSpec[] | undefined, candidate: Omit<LockSpec, 'reason'>) {
    return (locks ?? []).some((lock) => {
        if (lock.target !== candidate.target || lock.node !== candidate.node || lock.prop !== candidate.prop) {
            return false;
        }
        if (candidate.target === 'component') {
            return lock.component === candidate.component;
        }
        if (candidate.target === 'nodeData') {
            return lock.field === candidate.field;
        }
        return true;
    });
}
