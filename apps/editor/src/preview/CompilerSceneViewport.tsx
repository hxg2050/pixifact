import { useEffect, useRef, useState } from 'react';
import { Application as PixiApplication, Container, Graphics } from 'pixi.js';
import { normalizeSceneAssetId } from '../../../../packages/pixifact/src/compiler/sceneAssetPair';
import type { CompilerSceneDocument } from '../document/compilerSceneDocumentController';
import type { ProjectFileTreeNode } from '../services/projectFileTree';
import { createCompilerSceneRuntimePreview, destroyCompilerSceneRuntimePreview } from './compilerSceneRuntimePreview';

interface CompilerSceneViewportProps {
    document: CompilerSceneDocument;
    projectTree: ProjectFileTreeNode;
}

const previewWidth = 960;
const previewHeight = 540;

function fitScene(root: Container, width: number, height: number) {
    const scaleLimit = width < 480 || height < 240 ? 4 : 1;
    const scale = Math.min(previewWidth / width, previewHeight / height, scaleLimit);
    root.scale.set(scale);
    root.position.set(
        (previewWidth - width * scale) / 2,
        (previewHeight - height * scale) / 2,
    );
}

function selectedCompilerNode(document: CompilerSceneDocument) {
    return document.selection.type === 'node' && document.selection.node !== '__scene__'
        ? document.selection.node
        : undefined;
}

function drawSelectionOutline(outline: Graphics, target: Container | undefined) {
    outline.clear();
    if (!target) {
        return;
    }

    const bounds = target.getBounds();
    if (!Number.isFinite(bounds.x) || !Number.isFinite(bounds.y) || bounds.width <= 0 || bounds.height <= 0) {
        return;
    }

    outline
        .rect(bounds.x, bounds.y, bounds.width, bounds.height)
        .stroke({ width: 2, color: 0x16a34a, alpha: 1 });
}

export function CompilerSceneViewport({ document, projectTree }: CompilerSceneViewportProps) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const outlineRef = useRef<Graphics | undefined>(undefined);
    const nodesRef = useRef<Map<string, Container>>(new Map());
    const [status, setStatus] = useState('正在初始化编译器预览');

    useEffect(() => {
        const hostElement = hostRef.current;
        if (!hostElement) {
            return;
        }
        const host = hostElement;

        let cancelled = false;
        let initialized = false;
        let destroyed = false;
        const app = new PixiApplication();
        let destroyPreview = () => {};

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
                    width: previewWidth,
                    height: previewHeight,
                    background: 0x020617,
                    backgroundAlpha: 1,
                    antialias: true,
                    autoDensity: true,
                    resolution: Math.min(window.devicePixelRatio || 1, 2),
                });
                initialized = true;

                if (cancelled) {
                    destroyApp();
                    return;
                }

                const scenePath = normalizeSceneAssetId(document.scenePath.slice(projectTree.path.length + 1));
                const preview = await createCompilerSceneRuntimePreview({
                    document,
                    projectTree,
                    scenePath,
                });
                destroyPreview = () => destroyCompilerSceneRuntimePreview(preview);

                if (cancelled) {
                    destroyPreview();
                    destroyApp();
                    return;
                }

                fitScene(preview.root, preview.width, preview.height);
                app.stage.addChild(preview.root);
                nodesRef.current = preview.nodes;
                const outline = new Graphics();
                outline.eventMode = 'none';
                outlineRef.current = outline;
                app.stage.addChild(outline);
                drawSelectionOutline(outline, preview.nodes.get(selectedCompilerNode(document) ?? ''));
                app.canvas.className = 'pixifactCanvas';
                host.appendChild(app.canvas);
                setStatus('');
            } catch (error) {
                setStatus(error instanceof Error ? error.message : '编译器预览初始化失败');
                destroyPreview();
                destroyApp();
            }
        }

        void boot();

        return () => {
            cancelled = true;
            outlineRef.current = undefined;
            nodesRef.current = new Map();
            destroyPreview();
            destroyApp();
        };
    }, [document.scenePath, document.template, projectTree]);

    useEffect(() => {
        const outline = outlineRef.current;
        if (!outline) {
            return;
        }
        drawSelectionOutline(outline, nodesRef.current.get(selectedCompilerNode(document) ?? ''));
    }, [document.selection]);

    return (
        <div className="pixifactViewportHost" ref={hostRef}>
            {status ? <div className="runtimeStatus">{status}</div> : null}
        </div>
    );
}
