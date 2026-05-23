import ts from 'typescript';
import type {
    SceneScriptInterface,
    SceneTemplateEventContract,
    SceneTemplatePropContract,
    SceneTemplateSlotContract,
    SceneTemplateValue,
} from './spec';

export function extractSceneScriptInterface(source: string, fileName = 'scene-script.ts'): SceneScriptInterface {
    const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

    for (const statement of sourceFile.statements) {
        if (!ts.isClassDeclaration(statement)) {
            continue;
        }
        const scene = sceneDecorator(statement);
        if (!scene) {
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
                props[name] = {
                    type: requiredString(prop, 'type', 'prop'),
                    ...(prop.default !== undefined ? { default: prop.default } : {}),
                };
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
            scene,
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

export function emitSceneScriptInterfaceDescriptor(source: string, fileName = 'scene-script.ts') {
    return `${JSON.stringify(extractSceneScriptInterface(source, fileName), null, 2)}\n`;
}

function sceneDecorator(node: ts.ClassDeclaration) {
    const decorator = decorators(node).find((item) => decoratorName(item) === 'scene');
    if (!decorator) {
        return undefined;
    }
    const args = decoratorArguments(decorator);
    if (args.length !== 1) {
        throw new Error('@scene requires exactly one argument.');
    }
    if (ts.isObjectLiteralExpression(args[0])) {
        const options = objectLiteralValue(args[0], '@scene argument');
        const scene = options.scene;
        if (typeof scene !== 'string') {
            throw new Error('@scene requires string scene.');
        }
        return scene;
    }
    return stringLiteralValue(args[0], '@scene argument');
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

function objectLiteralValue(expression: ts.Expression, label: string) {
    if (!ts.isObjectLiteralExpression(expression)) {
        throw new Error(`${label} must be an object literal.`);
    }
    const result: Record<string, SceneTemplateValue> = {};
    for (const property of expression.properties) {
        if (!ts.isPropertyAssignment(property)) {
            throw new Error(`${label} only supports property assignments.`);
        }
        const name = memberName(property.name);
        if (!name) {
            throw new Error(`${label} only supports literal property names.`);
        }
        result[name] = literalValue(property.initializer, `${label}.${name}`);
    }
    return result;
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

function stringLiteralValue(expression: ts.Expression, label: string) {
    const value = literalValue(expression, label);
    if (typeof value !== 'string') {
        throw new Error(`${label} must be a string literal.`);
    }
    return value;
}

function requiredString(options: Record<string, SceneTemplateValue>, key: string, label: string) {
    const value = options[key];
    if (typeof value !== 'string') {
        throw new Error(`@${label} requires string ${key}.`);
    }
    return value;
}
