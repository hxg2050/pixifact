import type {
    Container,
} from 'pixi.js';
import type {
    SceneClassDecorator,
    SceneDecoratorOptions,
    SceneEventDecoratorOptions,
    SceneMemberDecorator,
    ScenePartDecoratorOptions,
    ScenePropDecoratorOptions,
    SceneSlotDecoratorOptions,
} from './spec';
import { mountScene } from './sceneRuntime';

type SceneConstructor = new (...args: unknown[]) => object;

interface SceneMetadata {
    parts: Map<string, string>;
    props: Map<string, ScenePropDecoratorOptions>;
    slots: Map<string, string>;
}

const metadataByConstructor = new WeakMap<object, SceneMetadata>();

export function scene(path: string): SceneClassDecorator;
export function scene(options: SceneDecoratorOptions): SceneClassDecorator;
export function scene(options: string | SceneDecoratorOptions): SceneClassDecorator {
    const path = typeof options === 'string' ? options : options.scene;
    return ((constructor: SceneConstructor) => {
        const SceneClass = class extends constructor {
            constructor(...args: unknown[]) {
                super(...args);

                const result = mountScene(this as object as Container, path);
                const metadata = sceneMetadata(constructor);
                for (const [property, id] of metadata.parts) {
                    Object.defineProperty(this, property, {
                        configurable: true,
                        enumerable: false,
                        value: result.parts[id],
                        writable: true,
                    });
                }
                for (const [property, slotName] of metadata.slots) {
                    Object.defineProperty(this, property, {
                        configurable: true,
                        enumerable: false,
                        value: result.slots[slotName],
                        writable: false,
                    });
                }
                for (const [property, propOptions] of metadata.props) {
                    if (propOptions.default !== undefined) {
                        (this as Record<string, unknown>)[property] = propOptions.default;
                    }
                }
                const ready = (this as { childrenCreated?: () => void }).childrenCreated;
                if (ready) {
                    ready.call(this);
                }
            }
        };
        Object.defineProperty(SceneClass, 'name', { value: constructor.name });
        return SceneClass;
    }) as SceneClassDecorator;
}

export function prop(options: ScenePropDecoratorOptions): SceneMemberDecorator {
    return ((target: object, propertyKey: string | symbol) => {
        sceneMetadata(target.constructor).props.set(memberName(propertyKey), options);
    }) as SceneMemberDecorator;
}

export function event(_options: SceneEventDecoratorOptions = {}): SceneMemberDecorator {
    return noopMemberDecorator;
}

export function slot(options: SceneSlotDecoratorOptions = {}): SceneMemberDecorator {
    return ((target: object, propertyKey: string | symbol) => {
        const property = memberName(propertyKey);
        sceneMetadata(target.constructor).slots.set(property, options.name ?? property);
    }) as SceneMemberDecorator;
}

export function part(options: ScenePartDecoratorOptions = {}): SceneMemberDecorator {
    return ((target: object, propertyKey: string | symbol) => {
        const property = memberName(propertyKey);
        sceneMetadata(target.constructor).parts.set(property, options.id ?? property);
    }) as SceneMemberDecorator;
}

const noopMemberDecorator = (() => undefined) as SceneMemberDecorator;

function sceneMetadata(constructor: object) {
    let metadata = metadataByConstructor.get(constructor);
    if (!metadata) {
        metadata = {
            parts: new Map(),
            props: new Map(),
            slots: new Map(),
        };
        metadataByConstructor.set(constructor, metadata);
    }
    return metadata;
}

function memberName(propertyKey: string | symbol) {
    if (typeof propertyKey === 'symbol') {
        throw new Error('Pixifact scene decorators require string member names.');
    }
    return propertyKey;
}
