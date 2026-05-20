import type { Component, InstantiateResult } from 'pixifact';
import type { GameState } from '../game/state';

type TextLike = Component & {
    text?: string;
    setDirty?: () => void;
};

function setText(scene: InstantiateResult, component: string, value: string) {
    const target = scene.components.get(component) as TextLike | undefined;
    if (target) {
        target.text = value;
        target.setDirty?.();
    }
}

export function updateHud(scene: InstantiateResult, state: GameState) {
    setText(scene, 'hpValue', `${Math.max(0, Math.round(state.hp))}`);
    setText(scene, 'scoreValue', `${state.score}`);
    setText(scene, 'waveValue', `${state.wave}`);
    setText(scene, 'energyValue', `${Math.round(state.energy)}%`);

    const hpFill = scene.nodes.get('hpFill');
    if (hpFill) {
        hpFill.width = Math.max(0, state.hp) * 1.8;
    }
    const energyFill = scene.nodes.get('energyFill');
    if (energyFill) {
        energyFill.width = Math.max(0, state.energy) * 1.6;
    }
}
