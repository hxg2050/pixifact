import type { Component } from "./Component";

export type ComponentConstructor<T extends Component = Component> = new (...args: any[]) => T;

export type PropFieldType =
    | 'number'
    | 'string'
    | 'boolean'
    | 'color'
    | 'enum'
    | 'vec2'
    | 'rect'
    | 'assetRef'
    | 'nodeRef'
    | 'componentRef'
    | 'event';

export interface PropSchema {
    key: string;
    type: PropFieldType;
    default?: unknown;
    description?: string;
    min?: number;
    max?: number;
    options?: readonly (string | number)[];
    component?: string;
    assetType?: string;
    hidden?: boolean;
    readOnly?: boolean;
    serialize?: boolean;
    examples?: readonly unknown[];
}

export interface ComponentSchema<T extends Component = Component> {
    type: string;
    ctor: ComponentConstructor<T>;
    displayName?: string;
    category?: string;
    icon?: string;
    description?: string;
    disallowMultiple?: boolean;
    require?: readonly string[];
    props: readonly PropSchema[];
}

export interface ComponentMetaOptions {
    type: string;
    displayName?: string;
    category?: string;
    icon?: string;
    description?: string;
    disallowMultiple?: boolean;
    require?: readonly string[];
}

export interface PropOptions extends Omit<PropSchema, 'key'> {}

export class ComponentRegistry {
    private static schemasByType = new Map<string, ComponentSchema>();
    private static schemasByCtor = new Map<ComponentConstructor, ComponentSchema>();

    static register<T extends Component>(schema: ComponentSchema<T>) {
        if (this.schemasByType.has(schema.type)) {
            throw new Error(`Component type "${schema.type}" is already registered.`);
        }
        this.schemasByType.set(schema.type, schema);
        this.schemasByCtor.set(schema.ctor, schema);
        return schema;
    }

    static get<T extends Component = Component>(type: string): ComponentSchema<T> | undefined {
        return this.schemasByType.get(type) as ComponentSchema<T> | undefined;
    }

    static getByCtor<T extends Component = Component>(ctor: ComponentConstructor<T>): ComponentSchema<T> | undefined {
        return this.schemasByCtor.get(ctor) as ComponentSchema<T> | undefined;
    }

    static list() {
        return Array.from(this.schemasByType.values());
    }

    static clear() {
        this.schemasByType.clear();
        this.schemasByCtor.clear();
    }
}
