import type { Container } from 'pixi.js';

const sceneSlots = new WeakMap<Container, Map<string, Container>>();

export function registerSlot(target: Container, name: string, host: Container) {
    let slots = sceneSlots.get(target);
    if (!slots) {
        slots = new Map();
        sceneSlots.set(target, slots);
    }
    slots.set(name, host);
}

export function mount<T extends Container>(target: Container, child: T, slot = 'default') {
    const host = sceneSlots.get(target)?.get(slot);
    if (!host) {
        throw new Error(`Unknown slot "${slot}".`);
    }
    host.addChild(child);
    return child;
}
