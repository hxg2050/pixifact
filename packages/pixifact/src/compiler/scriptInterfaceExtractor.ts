import ts from 'typescript';
import type {
    SceneScriptInterface,
    SceneTemplateEventContract,
    SceneTemplatePrimitivePropType,
    SceneTemplatePropContract,
    SceneTemplateScalarValue,
    SceneTemplateSlotContract,
    SceneTemplateValue,
} from './spec';

export interface ExtractSceneScriptInterfaceOptions {
    scene: string;
}

export function extractSceneScriptInterface(
    source: string,
    fileName = 'scene-script.ts',
    options: ExtractSceneScriptInterfaceOptions,
): SceneScriptInterface {
    const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const structClasses = collectStructClasses(sourceFile);

    for (const statement of sourceFile.statements) {
        if (!ts.isClassDeclaration(statement)) {
            continue;
        }
        if (!hasSceneDecorator(statement)) {
            continue;
        }
        const className = statement.name?.text;
        if (!className) {
            throw new Error('Scene script class is missing a name.');
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

        return {
            scene: options.scene,
            className,
            interface: {
                props,
                events,
                slots,
            },
            parts,
        };
    }

    throw new Error('No @scene decorator found.');
}

export function emitSceneScriptInterfaceDescriptor(
    source: string,
    fileName = 'scene-script.ts',
    options: ExtractSceneScriptInterfaceOptions,
) {
    return `${JSON.stringify(extractSceneScriptInterface(source, fileName, options), null, 2)}\n`;
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
