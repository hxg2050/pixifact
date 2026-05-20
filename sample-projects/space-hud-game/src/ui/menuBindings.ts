import type { InstantiateResult } from 'pixifact';

export function bindMenu(scene: InstantiateResult, onStart: () => void) {
    const startButton = scene.nodes.get('startButton');
    startButton?.display.on('pointertap', onStart);
    if (startButton) {
        startButton.display.eventMode = 'static';
        startButton.display.cursor = 'pointer';
    }
}
