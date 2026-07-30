import type { Container } from 'pixi.js';
import { setFrameLayout } from '../runtime';
import type {
    ScenePropDecoratorOptions,
    SceneTemplateBindingValue,
    SceneTemplateInterface,
    SceneTemplateScalarValue,
} from '../compiler/spec';

interface SceneBindingState {
    definitions: Record<string, ScenePropDecoratorOptions>;
    subscribers: Map<string, Set<() => void>>;
    values: Record<string, unknown>;
}

const states = new WeakMap<object, SceneBindingState>();

const layoutProps = new Set(['left', 'right', 'top', 'bottom', 'horizontal', 'vertical']);
const textStyleProps = new Set(['fontSize', 'fontFamily', 'fontWeight', 'fill']);
const colorProps = new Set(['fill', 'fillColor', 'strokeColor', 'tint']);

export function initializeSceneProps(
    target: object,
    definitions: ReadonlyMap<string, ScenePropDecoratorOptions>,
    initialProps: Record<string, unknown> = {},
) {
    const state: SceneBindingState = {
        definitions: Object.fromEntries(definitions),
        subscribers: new Map(),
        values: {},
    };
    states.set(target, state);

    for (const [name, definition] of Object.entries(state.definitions)) {
        state.values[name] = Object.hasOwn(initialProps, name)
            ? initialProps[name]
            : definition.default;
        Object.defineProperty(target, name, {
            configurable: true,
            enumerable: true,
            get: () => state.values[name],
            set: (value: unknown) => setSceneProp(target, name, value),
        });
    }
}

export function initializeScenePropsFromInterface(
    target: object,
    sceneInterface: SceneTemplateInterface,
    initialProps: Record<string, unknown> = {},
) {
    initializeSceneProps(target, new Map(Object.entries(sceneInterface.props).map(([name, contract]) => [
        name,
        {
            ...('default' in contract ? { default: contract.default } : {}),
            ...(contract.type === 'variant' ? { variants: contract.variants } : {}),
        },
    ])), initialProps);
}

export function setSceneProp(target: object, name: string, value: unknown) {
    const state = sceneBindingState(target);
    if (Object.is(state.values[name], value)) {
        return;
    }
    state.values[name] = value;
    for (const update of state.subscribers.get(name) ?? []) {
        update();
    }
}

export function getSceneProp<T = unknown>(target: object, name: string): T {
    return sceneBindingState(target).values[name] as T;
}

export function readSceneBindingValue<T = unknown>(
    target: object,
    binding: SceneTemplateBindingValue,
): T {
    const state = sceneBindingState(target);
    const [prop, field] = binding.path;
    const value = state.values[prop];
    if (!field) {
        return value as T;
    }
    const selected = String(value);
    return state.definitions[prop]?.variants?.[selected]?.[field] as T;
}

export function bindSceneNodeProp(
    root: object,
    binding: SceneTemplateBindingValue,
    target: Container,
    prop: string,
) {
    const state = sceneBindingState(root);
    const update = () => applySceneNodeProp(target, prop, readSceneBindingValue(root, binding));
    const subscribers = state.subscribers.get(binding.path[0]) ?? new Set();
    subscribers.add(update);
    state.subscribers.set(binding.path[0], subscribers);
    update();
}

export function applySceneNodeProp(target: Container, prop: string, sourceValue: unknown) {
    if (prop === 'text') {
        (target as unknown as { text: string }).text = String(sourceValue ?? '');
        return;
    }
    const value = normalizeBindingValue(prop, sourceValue);
    if (layoutProps.has(prop)) {
        setFrameLayout(target, { [prop]: value } as Parameters<typeof setFrameLayout>[1]);
        return;
    }

    const record = target as unknown as Record<string, unknown>;
    if (textStyleProps.has(prop) && 'text' in record && record.style) {
        (record.style as Record<string, unknown>)[prop] = value;
        return;
    }
    if (prop === 'scaleX' || prop === 'scaleY') {
        const point = record.scale as { x: number; y: number };
        point[prop === 'scaleX' ? 'x' : 'y'] = value as number;
        return;
    }
    if (prop === 'pivotX' || prop === 'pivotY') {
        const point = record.pivot as { x: number; y: number };
        point[prop === 'pivotX' ? 'x' : 'y'] = value as number;
        return;
    }
    if (prop === 'skewX' || prop === 'skewY') {
        const point = record.skew as { x: number; y: number };
        point[prop === 'skewX' ? 'x' : 'y'] = value as number;
        return;
    }
    if (prop === 'anchorX' || prop === 'anchorY') {
        const point = record.anchor as { x: number; y: number };
        point[prop === 'anchorX' ? 'x' : 'y'] = value as number;
        return;
    }
    if (prop === 'tilePositionX' || prop === 'tilePositionY') {
        const point = record.tilePosition as { x: number; y: number };
        point[prop === 'tilePositionX' ? 'x' : 'y'] = value as number;
        return;
    }
    if (prop === 'tileScaleX' || prop === 'tileScaleY') {
        const point = record.tileScale as { x: number; y: number };
        point[prop === 'tileScaleX' ? 'x' : 'y'] = value as number;
        return;
    }
    record[prop] = value;
}

function normalizeBindingValue(prop: string, value: unknown) {
    if (colorProps.has(prop) && typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)) {
        return Number.parseInt(value.slice(1), 16);
    }
    return value;
}

function sceneBindingState(target: object) {
    const state = states.get(target);
    if (!state) {
        throw new Error('Scene props must be initialized before bindings are mounted.');
    }
    return state;
}

export type SceneBindingInitialValue = SceneTemplateScalarValue | object;
