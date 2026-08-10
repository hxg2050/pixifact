import type { MiniGameApi } from './types';

interface LifecycleTarget {
    readonly started?: boolean;
    start(): void;
    stop(): void;
}

export interface MiniGameLifecycleBinding {
    dispose(): void;
    readonly hidden: boolean;
}

export function bindMiniGameLifecycle(
    api: MiniGameApi,
    target: LifecycleTarget,
    options: { onHide?(): void; onShow?(): void } = {},
): MiniGameLifecycleBinding {
    let disposed = false;
    let hidden = false;
    let resumeOnShow = false;
    const handleHide = () => {
        if (disposed || hidden) {
            return;
        }
        hidden = true;
        resumeOnShow = target.started ?? true;
        options.onHide?.();
        target.stop();
    };
    const handleShow = () => {
        if (disposed || !hidden) {
            return;
        }
        hidden = false;
        if (resumeOnShow) {
            target.start();
        }
        options.onShow?.();
    };
    api.onHide(handleHide);
    api.onShow(handleShow);
    return {
        dispose() {
            if (disposed) {
                return;
            }
            disposed = true;
            target.stop();
            api.offHide?.(handleHide);
            api.offShow?.(handleShow);
        },
        get hidden() {
            return hidden;
        },
    };
}
