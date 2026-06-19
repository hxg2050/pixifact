import ts from 'typescript';
import type {
    SceneScriptInterface,
    SceneTemplateEventContract,
    SceneTemplateInterface,
    SceneTemplatePrimitivePropType,
    SceneTemplatePropContract,
    SceneTemplateScalarValue,
    SceneTemplateSlotContract,
    SceneTemplateValue,
} from './spec';

export interface ExtractSceneScriptInterfaceOptions {
    scene: string;
}

export interface ExtractSceneScriptInterfaceSource extends ExtractSceneScriptInterfaceOptions {
    source: string;
    fileName?: string;
}

interface ExtractedSceneScriptClass {
    scene?: string;
    className: string;
    parentClassName?: string;
    interface: SceneTemplateInterface;
    parts: Record<string, string>;
}

export function extractSceneScriptInterface(
    source: string,
    fileName = 'scene-script.ts',
    options: ExtractSceneScriptInterfaceOptions,
): SceneScriptInterface {
    const descriptors = composeSceneScriptClasses(extractSceneScriptClasses(source, fileName, options));
    const descriptor = descriptors[options.scene];
    if (!descriptor) {
        throw new Error('No @scene decorator found.');
    }
    return descriptor;
}

export function extractSceneScriptInterfaces(
    sources: readonly ExtractSceneScriptInterfaceSource[],
): Record<string, SceneScriptInterface> {
    return composeSceneScriptClasses(sources.flatMap((source) => extractSceneScriptClasses(
        source.source,
        source.fileName ?? 'scene-script.ts',
        { scene: source.scene },
    )));
}

function extractSceneScriptClasses(
    source: string,
    fileName: string,
    options: ExtractSceneScriptInterfaceOptions,
): ExtractedSceneScriptClass[] {
    const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const structClasses = collectStructClasses(sourceFile);
    const classes: ExtractedSceneScriptClass[] = [];

    for (const statement of sourceFile.statements) {
        if (!ts.isClassDeclaration(statement)) {
            continue;
        }
        const isSceneClass = hasSceneDecorator(statement);
        const className = statement.name?.text;
        if (!className) {
            if (isSceneClass) {
                throw new Error('Scene script class is missing a name.');
            }
            continue;
        }

        const props: Record<string, SceneTemplatePropContract> = {};
        const events: Record<string, SceneTemplateEventContract> = {};
        const slots: Record<string, SceneTemplateSlotContract> = {};
        const parts: Record<string, string> = {};

        for (const member of statement.members) {
            const name = memberName(member.name);
            if (!name) {
                continue;
            }

            const prop = memberDecoratorOptions(member, 'prop');
            if (prop) {
                props[name] = propContract(prop, structClasses);
            }

            const event = memberDecoratorOptions(member, 'event');
            if (event) {
                events[typeof event.name === 'string' ? event.name : name] = { type: 'action' };
            }

            const slot = memberDecoratorOptions(member, 'slot');
            if (slot) {
                slots[typeof slot.name === 'string' ? slot.name : name] = {};
            }

            const part = memberDecoratorOptions(member, 'part');
            if (part) {
                parts[name] = typeof part.id === 'string' ? part.id : name;
            }
        }

        const parentClassName = parentClassNameOf(statement);
        if (!isSceneClass && !parentClassName && !hasPublicContract(props, events, slots, parts)) {
            continue;
        }

        classes.push({
            ...(isSceneClass ? { scene: options.scene } : {}),
            className,
            ...(parentClassName ? { parentClassName } : {}),
            interface: {
                props,
                events,
                slots,
            },
            parts,
        });
    }

    return classes;
}

export function emitSceneScriptInterfaceDescriptor(
    source: string,
    fileName = 'scene-script.ts',
    options: ExtractSceneScriptInterfaceOptions,
) {
    return `${JSON.stringify(extractSceneScriptInterface(source, fileName, options), null, 2)}\n`;
}

function composeSceneScriptClasses(classes: readonly ExtractedSceneScriptClass[]): Record<string, SceneScriptInterface> {
    const classesByName = new Map<string, ExtractedSceneScriptClass[]>();
    for (const item of classes) {
        const bucket = classesByName.get(item.className) ?? [];
        bucket.push(item);
        classesByName.set(item.className, bucket);
    }

    const composed = new Map<ExtractedSceneScriptClass, SceneTemplateInterface>();
    const visiting = new Set<ExtractedSceneScriptClass>();

    function compose(item: ExtractedSceneScriptClass): SceneTemplateInterface {
        const cached = composed.get(item);
        if (cached) {
            return cached;
        }
        if (visiting.has(item)) {
            throw new Error(`Scene script class "${item.className}" has a circular inheritance chain.`);
        }

        visiting.add(item);
        const parent = item.parentClassName ? resolveParentClass(item, classesByName) : undefined;
        const parentInterface = parent ? compose(parent) : emptySceneInterface();
        const sceneInterface = mergeSceneInterfaces(parentInterface, item.interface);
        visiting.delete(item);
        composed.set(item, sceneInterface);
        return sceneInterface;
    }

    const result: Record<string, SceneScriptInterface> = {};
    for (const item of classes) {
        if (!item.scene) {
            continue;
        }
        if (result[item.scene]) {
            throw new Error(`Scene script "${item.scene}" has multiple @scene classes.`);
        }
        result[item.scene] = {
            scene: item.scene,
            className: item.className,
            interface: compose(item),
            parts: item.parts,
        };
    }
    return result;
}

function resolveParentClass(
    item: ExtractedSceneScriptClass,
    classesByName: ReadonlyMap<string, readonly ExtractedSceneScriptClass[]>,
) {
    const candidates = classesByName.get(item.parentClassName ?? '') ?? [];
    if (candidates.length === 0) {
        return undefined;
    }
    if (candidates.length > 1) {
        throw new Error(`Scene script parent class "${item.parentClassName}" is ambiguous for "${item.className}".`);
    }
    return candidates[0];
}

function emptySceneInterface(): SceneTemplateInterface {
    return {
        props: {},
        events: {},
        slots: {},
    };
}

function mergeSceneInterfaces(parent: SceneTemplateInterface, own: SceneTemplateInterface): SceneTemplateInterface {
    return {
        props: {
            ...parent.props,
            ...own.props,
        },
        events: {
            ...parent.events,
            ...own.events,
        },
        slots: {
            ...parent.slots,
            ...own.slots,
        },
    };
}

function hasPublicContract(
    props: Record<string, SceneTemplatePropContract>,
    events: Record<string, SceneTemplateEventContract>,
    slots: Record<string, SceneTemplateSlotContract>,
    parts: Record<string, string>,
) {
    return Object.keys(props).length > 0
        || Object.keys(events).length > 0
        || Object.keys(slots).length > 0
        || Object.keys(parts).length > 0;
}

function hasSceneDecorator(node: ts.ClassDeclaration) {
    const decorator = decorators(node).find((item) => decoratorName(item) === 'scene');
    if (!decorator) {
        return false;
    }
    const args = decoratorArguments(decorator);
    if (args.length !== 0) {
        throw new Error('@scene does not accept arguments. Pair scripts by colocating a same-basename .ts file next to the .scene file.');
    }
    return true;
}

function parentClassNameOf(node: ts.ClassDeclaration) {
    const heritage = node.heritageClauses?.find((item) => item.token === ts.SyntaxKind.ExtendsKeyword);
    const parent = heritage?.types[0]?.expression;
    if (!parent) {
        return undefined;
    }
    if (ts.isIdentifier(parent)) {
        return parent.text;
    }
    if (ts.isPropertyAccessExpression(parent)) {
        return parent.name.text;
    }
    return undefined;
}

function memberDecoratorOptions(member: ts.ClassElement, name: string) {
    const decorator = decorators(member).find((item) => decoratorName(item) === name);
    if (!decorator) {
        return undefined;
    }
    const args = decoratorArguments(decorator);
    if (args.length === 0) {
        return {};
    }
    if (args.length !== 1) {
        throw new Error(`@${name} accepts at most one argument.`);
    }
    return objectLiteralValue(args[0], `@${name} argument`);
}

function decorators(node: ts.Node) {
    return ts.canHaveDecorators(node) ? ts.getDecorators(node) ?? [] : [];
}

function decoratorName(decorator: ts.Decorator) {
    const expression = decorator.expression;
    if (ts.isIdentifier(expression)) {
        return expression.text;
    }
    if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression)) {
        return expression.expression.text;
    }
    return undefined;
}

function decoratorArguments(decorator: ts.Decorator) {
    const expression = decorator.expression;
    return ts.isCallExpression(expression) ? [...expression.arguments] : [];
}

function memberName(name: ts.PropertyName | undefined) {
    if (!name) {
        return undefined;
    }
    if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
        return name.text;
    }
    return undefined;
}

interface DecoratorObjectValue {
    [key: string]: DecoratorValue;
}

type DecoratorValue = SceneTemplateValue | ts.Identifier;

interface StructClassInfo {
    exported: boolean;
    node: ts.ClassDeclaration;
}

interface StructContractInfo {
    fields: Record<string, {
        type: SceneTemplatePrimitivePropType;
        default: SceneTemplateScalarValue;
    }>;
    hasRequiredConstructorParameters: boolean;
}

function collectStructClasses(sourceFile: ts.SourceFile) {
    const classes = new Map<string, StructClassInfo>();
    for (const statement of sourceFile.statements) {
        if (!ts.isClassDeclaration(statement) || !statement.name) {
            continue;
        }
        classes.set(statement.name.text, {
            exported: statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false,
            node: statement,
        });
    }
    return classes;
}

function structFields(node: ts.ClassDeclaration) {
    const fields: StructContractInfo['fields'] = {};
    for (const member of node.members) {
        if (!ts.isPropertyDeclaration(member)) {
            continue;
        }
        const name = memberName(member.name);
        if (!name) {
            throw new Error(`Struct prop type ${node.name?.text ?? 'anonymous'} only supports literal field names.`);
        }
        if (!member.initializer) {
            throw new Error(`Struct prop type ${node.name?.text ?? 'anonymous'} field ${name} requires a primitive initializer.`);
        }
        const value = literalValue(member.initializer, `struct ${node.name?.text ?? 'anonymous'}.${name}`);
        if (!isSceneTemplateScalarValue(value)) {
            throw new Error(`Struct prop type ${node.name?.text ?? 'anonymous'} field ${name} requires a primitive initializer.`);
        }
        fields[name] = {
            type: sceneTemplateScalarType(value),
            default: value,
        };
    }
    return fields;
}

function propContract(prop: DecoratorObjectValue, structClasses: ReadonlyMap<string, StructClassInfo>): SceneTemplatePropContract {
    const type = prop.type;
    const defaultValue = prop.default;
    if (type === 'string' || type === 'number' || type === 'boolean') {
        throw new Error('@prop type must be String, Number, Boolean, or a struct class.');
    }
    if (!isIdentifierValue(type)) {
        throw new Error('@prop type must be String, Number, Boolean, or a struct class.');
    }
    const primitiveType = primitiveConstructorType(type.text);
    if (primitiveType) {
        if (defaultValue !== undefined && (!isSceneTemplateScalarValue(defaultValue) || sceneTemplateScalarType(defaultValue) !== primitiveType)) {
            throw new Error(`@prop default for ${type.text} must be a ${primitiveType} literal.`);
        }
        return {
            type: primitiveType,
            ...(defaultValue !== undefined ? { default: defaultValue } : {}),
        };
    }

    const structClass = structClasses.get(type.text);
    if (!structClass) {
        throw new Error(`Struct prop type ${type.text} was not found.`);
    }
    if (!structClass.exported) {
        throw new Error(`Struct prop type ${type.text} must be exported.`);
    }
    if (defaultValue !== undefined) {
        throw new Error('@prop default is only supported for primitive props.');
    }
    const struct = structContractInfo(structClass.node);
    if (struct.hasRequiredConstructorParameters) {
        throw new Error(`Struct prop type ${type.text} must be constructable with no required parameters.`);
    }
    return {
        type: 'struct',
        struct: type.text,
        fields: struct.fields,
    };
}

function structContractInfo(node: ts.ClassDeclaration): StructContractInfo {
    return {
        fields: structFields(node),
        hasRequiredConstructorParameters: node.members.some((member) => ts.isConstructorDeclaration(member) && member.parameters.some((parameter) => !parameter.questionToken && !parameter.initializer)),
    };
}

function primitiveConstructorType(name: string): SceneTemplatePrimitivePropType | undefined {
    if (name === 'String') {
        return 'string';
    }
    if (name === 'Number') {
        return 'number';
    }
    if (name === 'Boolean') {
        return 'boolean';
    }
    return undefined;
}

function isIdentifierValue(value: DecoratorValue): value is ts.Identifier {
    return ts.isIdentifier(value as ts.Node);
}

function isSceneTemplateScalarValue(value: DecoratorValue): value is SceneTemplateScalarValue {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function sceneTemplateScalarType(value: SceneTemplateScalarValue): SceneTemplatePrimitivePropType {
    if (typeof value === 'string') {
        return 'string';
    }
    if (typeof value === 'number') {
        return 'number';
    }
    return 'boolean';
}

function objectLiteralValue(expression: ts.Expression, label: string): DecoratorObjectValue {
    if (!ts.isObjectLiteralExpression(expression)) {
        throw new Error(`${label} must be an object literal.`);
    }
    const result: DecoratorObjectValue = {};
    for (const property of expression.properties) {
        if (!ts.isPropertyAssignment(property)) {
            throw new Error(`${label} only supports property assignments.`);
        }
        const name = memberName(property.name);
        if (!name) {
            throw new Error(`${label} only supports literal property names.`);
        }
        result[name] = decoratorValue(property.initializer, `${label}.${name}`);
    }
    return result;
}

function decoratorValue(expression: ts.Expression, label: string): DecoratorValue {
    if (ts.isIdentifier(expression)) {
        return expression;
    }
    return literalValue(expression, label);
}

function literalValue(expression: ts.Expression, label: string): SceneTemplateValue {
    if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
        return expression.text;
    }
    if (expression.kind === ts.SyntaxKind.TrueKeyword) {
        return true;
    }
    if (expression.kind === ts.SyntaxKind.FalseKeyword) {
        return false;
    }
    if (ts.isNumericLiteral(expression)) {
        return Number(expression.text);
    }
    if (ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(expression.operand)) {
        return -Number(expression.operand.text);
    }
    throw new Error(`${label} must be a string, number, or boolean literal.`);
}
