import { wechatApi } from './types';

interface LifecycleTarget {
    readonly started?: boolean;
    start(): void;
    stop(): void;
}

export interface WechatLifecycleBinding {
    dispose(): void;
    readonly hidden: boolean;
}

export function bindWechatLifecycle(
    target: LifecycleTarget,
    options: { onHide?(): void; onShow?(): void } = {},
): WechatLifecycleBinding {
    const wx = wechatApi();
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
    wx.onHide(handleHide);
    wx.onShow(handleShow);
    return {
        dispose() {
            if (disposed) {
                return;
            }
            disposed = true;
            target.stop();
            wx.offHide?.(handleHide);
            wx.offShow?.(handleShow);
        },
        get hidden() {
            return hidden;
        },
    };
}
