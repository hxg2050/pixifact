import { ComponentRegistry } from "./ComponentRegistry";
import type {
    ComponentConstructor,
    ComponentMetaOptions,
    PropOptions,
    PropSchema,
} from "./ComponentRegistry";
import type { Component } from "./Component";

const propSchemas = new WeakMap<Function, PropSchema[]>();

function getOwnPropSchemas(ctor: Function) {
    let props = propSchemas.get(ctor);
    if (!props) {
        props = [];
        propSchemas.set(ctor, props);
    }
    return props;
}

export function getDecoratedPropSchemas(ctor: Function) {
    const hierarchy: Function[] = [];
    let proto = ctor.prototype;

    while (proto && proto.constructor && proto.constructor !== Object) {
        hierarchy.unshift(proto.constructor);
        proto = Object.getPrototypeOf(proto);
    }

    const propsByKey = new Map<string, PropSchema>();
    for (const item of hierarchy) {
        for (const prop of propSchemas.get(item) ?? []) {
            propsByKey.set(prop.key, prop);
        }
    }
    return Array.from(propsByKey.values());
}

export function ComponentMeta(options: ComponentMetaOptions): ClassDecorator {
    return (target) => {
        ComponentRegistry.register({
            ...options,
            ctor: target as unknown as ComponentConstructor<Component>,
            props: getDecoratedPropSchemas(target),
        });
    };
}

export function Prop(options: PropOptions): PropertyDecorator {
    return (target, propertyKey) => {
        const props = getOwnPropSchemas(target.constructor);
        const key = String(propertyKey);
        const index = props.findIndex((prop) => prop.key === key);
        const schema: PropSchema = {
            key,
            serialize: true,
            ...options,
        };

        if (index === -1) {
            props.push(schema);
        } else {
            props[index] = schema;
        }
    };
}
