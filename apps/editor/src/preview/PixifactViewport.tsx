import { useEffect, useRef, useState } from 'react';
import {
    Graphics as PixiGraphics,
    Rectangle,
    type FederatedPointerEvent,
} from 'pixi.js';
import {
    Application,
    createRuntimeActions,
    emptySelection,
} from 'pixifact';
import type {
    SceneDocument,
    RuntimePreview,
} from 'pixifact';
import { selectionBoundsForNode } from './selectionBounds';

interface PixifactViewportProps {
    document: SceneDocument;
    revision: number;
}

function attachSelectionHandlers(document: SceneDocument, preview: RuntimePreview) {
    const seen = new Set<object>();
    const cleanup: Array<() => void> = [];

    for (const [locator, node] of preview.nodes) {
        if (node === preview.root) {
            continue;
        }

        if (seen.has(node)) {
            continue;
        }
        seen.add(node);

        const display = node.display;
        const handleTap = (event: FederatedPointerEvent) => {
            event.stopPropagation();
            document.setSelection({ type: 'node', node: locator });
        };

        display.eventMode = 'static';
        display.cursor = 'pointer';
        display.hitArea = new Rectangle(0, 0, Math.max(node.width, 1), Math.max(node.height, 1));
        display.on('pointertap', handleTap);

        cleanup.push(() => {
            display.off('pointertap', handleTap);
            display.eventMode = 'auto';
            display.cursor = 'default';
            display.hitArea = null;
        });
    }

    return () => {
        for (const item of cleanup) {
            item();
        }
    };
}

function drawSelectionBounds(document: SceneDocument, preview: RuntimePreview | undefined, outline: PixiGraphics) {
    outline.clear();

    if (!preview || document.selection.type === 'none') {
        return;
    }

    const node = preview.nodes.get(document.selection.node);
    if (!node) {
        return;
    }

    const bounds = selectionBoundsForNode(node);
    if (!bounds) {
        return;
    }

    outline
        .rect(bounds.x, bounds.y, bounds.width, bounds.height)
        .stroke({ width: 2, color: 0x16a34a, alpha: 1 });
}

export function PixifactViewport({ document, revision }: PixifactViewportProps) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const appRef = useRef<Application | undefined>(undefined);
    const outlineRef = useRef<PixiGraphics | undefined>(undefined);
    const cleanupHandlersRef = useRef<(() => void) | undefined>(undefined);
    const previewRef = useRef<RuntimePreview | undefined>(undefined);
    const [status, setStatus] = useState('正在初始化运行时');

    useEffect(() => {
        const mountedHost = hostRef.current;
        if (!mountedHost) {
            return;
        }
        const hostElement = mountedHost;

        let cancelled = false;
        let initialized = false;
        let destroyed = false;
        const app = new Application();
        appRef.current = app;

        const destroyApp = () => {
            if (!initialized || destroyed) {
                return;
            }

            destroyed = true;
            app.destroy({ removeView: true }, { children: true });
        };

        async function boot() {
            try {
                await app.init({
                    width: 960,
                    height: 540,
                    background: 0xffffff,
                    antialias: true,
                    autoDensity: true,
                    resolution: Math.min(window.devicePixelRatio || 1, 2),
                });
                initialized = true;

                if (cancelled) {
                    destroyApp();
                    return;
                }

                app.canvas.className = 'pixifactCanvas';
                hostElement.appendChild(app.canvas);
                app.root.width = 960;
                app.root.height = 540;
                app.stage.eventMode = 'static';
                app.stage.hitArea = new Rectangle(0, 0, 960, 540);
                app.stage.on('pointertap', () => document.setSelection(emptySelection));

                const outline = new PixiGraphics();
                outline.eventMode = 'none';
                outlineRef.current = outline;
                app.stage.addChild(outline);

                const preview = document.rebuildPreview({
                    actions: createRuntimeActions(document.actions),
                }, app.root);
                previewRef.current = preview;
                cleanupHandlersRef.current = attachSelectionHandlers(document, preview);
                app.stage.addChild(outline);
                drawSelectionBounds(document, preview, outline);
                setStatus('');
            } catch (error) {
                setStatus(error instanceof Error ? error.message : '运行时初始化失败');
            }
        }

        void boot();

        return () => {
            cancelled = true;
            cleanupHandlersRef.current?.();
            cleanupHandlersRef.current = undefined;
            previewRef.current = undefined;
            outlineRef.current = undefined;
            document.clearPreview();
            destroyApp();
            appRef.current = undefined;
        };
    }, [document]);

    useEffect(() => {
        const app = appRef.current;
        const outline = outlineRef.current;
        const preview = document.preview;

        if (!app || !outline || !preview) {
            return;
        }

        if (previewRef.current !== preview) {
            cleanupHandlersRef.current?.();
            cleanupHandlersRef.current = attachSelectionHandlers(document, preview);
            previewRef.current = preview;
        }

        app.stage.addChild(outline);
        drawSelectionBounds(document, preview, outline);
    }, [document, revision]);

    return (
        <div className="pixifactViewportHost" ref={hostRef}>
            {status ? <div className="runtimeStatus">{status}</div> : null}
        </div>
    );
}
