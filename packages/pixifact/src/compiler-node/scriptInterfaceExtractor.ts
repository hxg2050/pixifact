import ts from 'typescript';
import type {
    SceneScriptInterface,
    SceneTemplateEventContract,
    SceneTemplateInterface,
    SceneTemplatePrimitivePropType,
    SceneTemplatePropContract,
    SceneTemplateScalarValue,
    SceneTemplateVariants,
    SceneTemplateSlotContract,
} from '../compiler/spec';

export interface ExtractSceneScriptInterfaceOptions {
    scene: string;
}

export interface ExtractSceneScriptInterfaceSource extends ExtractSceneScriptInterfaceOptions {
    source: string;
    fileName?: string;
}

interface ExtractedSceneScriptClass {
    sourceId: string;
    scriptScene: string;
    scene?: string;
    className: string;
    parentClassName?: string;
    imports: ReadonlyMap<string, string>;
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
    const sourceId = normalizeScriptSourceId(fileName);
    const imports = collectNamedImports(sourceFile, sourceId);
    const structClasses = collectStructClasses(sourceFile);
    const variantDeclarations = collectVariantDeclarations(sourceFile);
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
        if (isSceneClass && sceneConstructorHasParameters(statement)) {
            throw new Error(`@scene class "${className}" must not declare constructor parameters. Use @prop() or an explicit method after construction.`);
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
                assertStaticPropMember(member, name);
                props[name] = propContract(prop, member, structClasses, variantDeclarations);
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
            sourceId,
            scriptScene: options.scene,
            ...(isSceneClass ? { scene: options.scene } : {}),
            className,
            ...(parentClassName ? { parentClassName } : {}),
            imports,
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
    const classesBySourceAndName = new Map<string, ExtractedSceneScriptClass>();
    for (const item of classes) {
        const bucket = classesByName.get(item.className) ?? [];
        bucket.push(item);
        classesByName.set(item.className, bucket);
        classesBySourceAndName.set(sourceClassKey(item.sourceId, item.className), item);
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
        const parent = item.parentClassName ? resolveParentClass(item, classesByName, classesBySourceAndName) : undefined;
        const parentInterface = parent ? inheritedSceneInterface(compose(parent), parent.scriptScene, item.scriptScene) : emptySceneInterface();
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
    classesBySourceAndName: ReadonlyMap<string, ExtractedSceneScriptClass>,
) {
    const parentClassName = item.parentClassName ?? '';
    const sameSourceParent = classesBySourceAndName.get(sourceClassKey(item.sourceId, parentClassName));
    if (sameSourceParent) {
        return sameSourceParent;
    }

    const importedSource = item.imports.get(parentClassName);
    if (importedSource) {
        return classesBySourceAndName.get(sourceClassKey(importedSource, parentClassName));
    }

    const candidates = classesByName.get(parentClassName) ?? [];
    if (candidates.length === 0) {
        return undefined;
    }
    if (candidates.length > 1) {
        throw new Error(`Scene script parent class "${item.parentClassName}" is ambiguous for "${item.className}".`);
    }
    return candidates[0];
}

function sourceClassKey(sourceId: string, className: string) {
    return `${sourceId}:${className}`;
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

function inheritedSceneInterface(
    parent: SceneTemplateInterface,
    parentSourceScene: string,
    childSourceScene: string,
): SceneTemplateInterface {
    return {
        props: Object.fromEntries(Object.entries(parent.props).map(([name, contract]) => {
            if (contract.type !== 'struct') {
                return [name, contract];
            }
            const sourceScene = contract.sourceScene ?? parentSourceScene;
            return [
                name,
                sourceScene === childSourceScene
                    ? contract
                    : { ...contract, sourceScene },
            ];
        })),
        events: parent.events,
        slots: parent.slots,
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

function collectNamedImports(sourceFile: ts.SourceFile, sourceId: string) {
    const imports = new Map<string, string>();
    for (const statement of sourceFile.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
            continue;
        }
        const moduleSpecifier = statement.moduleSpecifier.text;
        if (!moduleSpecifier.startsWith('.')) {
            continue;
        }
        const namedBindings = statement.importClause?.namedBindings;
        if (!namedBindings || !ts.isNamedImports(namedBindings)) {
            continue;
        }
        const targetSource = resolveScriptSourceId(sourceId, moduleSpecifier);
        for (const element of namedBindings.elements) {
            imports.set(element.name.text, targetSource);
        }
    }
    return imports;
}

function normalizeScriptSourceId(value: string) {
    const normalized = normalizePosixPath(value);
    return hasScriptExtension(normalized) ? normalized : `${normalized}.ts`;
}

function resolveScriptSourceId(fromSourceId: string, moduleSpecifier: string) {
    const dirname = posixDirname(fromSourceId);
    return normalizeScriptSourceId(normalizePosixPath(`${dirname}/${moduleSpecifier}`));
}

function hasScriptExtension(value: string) {
    return /\.[cm]?[tj]sx?$/.test(value);
}

function posixDirname(value: string) {
    const normalized = normalizePosixPath(value);
    const index = normalized.lastIndexOf('/');
    return index >= 0 ? normalized.slice(0, index) : '';
}

function normalizePosixPath(value: string) {
    const segments: string[] = [];
    for (const segment of value.replaceAll('\\', '/').split('/')) {
        if (!segment || segment === '.') {
            continue;
        }
        if (segment === '..') {
            if (segments.length && segments[segments.length - 1] !== '..') {
                segments.pop();
            } else {
                segments.push(segment);
            }
            continue;
        }
        segments.push(segment);
    }
    return segments.join('/');
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

function sceneConstructorHasParameters(node: ts.ClassDeclaration) {
    return node.members.some((member) => ts.isConstructorDeclaration(member) && member.parameters.length > 0);
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

type DecoratorValue = SceneTemplateScalarValue | ts.Identifier;

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

function collectVariantDeclarations(sourceFile: ts.SourceFile) {
    const variants = new Map<string, SceneTemplateVariants>();
    for (const statement of sourceFile.statements) {
        if (!ts.isVariableStatement(statement)) {
            continue;
        }
        for (const declaration of statement.declarationList.declarations) {
            if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
                continue;
            }
            const initializer = unwrapExpression(declaration.initializer);
            if (
                !ts.isCallExpression(initializer)
                || !ts.isIdentifier(initializer.expression)
                || initializer.expression.text !== 'defineVariants'
            ) {
                continue;
            }
            if (initializer.arguments.length !== 1) {
                throw new Error('defineVariants accepts exactly one argument.');
            }
            variants.set(
                declaration.name.text,
                variantObjectValue(initializer.arguments[0], 'defineVariants argument'),
            );
        }
    }
    return variants;
}

function variantObjectValue(expression: ts.Expression, label: string): SceneTemplateVariants {
    const object = unwrapExpression(expression);
    if (!ts.isObjectLiteralExpression(object)) {
        throw new Error(`${label} must be an object literal.`);
    }
    const variants: SceneTemplateVariants = {};
    let expectedFields: Record<string, string> | undefined;
    for (const property of object.properties) {
        if (!ts.isPropertyAssignment(property)) {
            throw new Error(`${label} only supports property assignments.`);
        }
        const name = memberName(property.name);
        if (!name) {
            throw new Error(`${label} only supports literal case names.`);
        }
        const caseExpression = unwrapExpression(property.initializer);
        if (!ts.isObjectLiteralExpression(caseExpression)) {
            throw new Error(`${label}.${name} must be an object literal.`);
        }
        const fields: Record<string, SceneTemplateScalarValue> = {};
        for (const field of caseExpression.properties) {
            if (!ts.isPropertyAssignment(field)) {
                throw new Error(`${label}.${name} only supports property assignments.`);
            }
            const fieldName = memberName(field.name);
            if (!fieldName) {
                throw new Error(`${label}.${name} only supports literal field names.`);
            }
            fields[fieldName] = literalValue(field.initializer, `${label}.${name}.${fieldName}`);
        }
        const fieldTypes = Object.fromEntries(Object.entries(fields).map(([field, value]) => [field, typeof value]));
        if (!expectedFields) {
            expectedFields = fieldTypes;
        } else if (!sameFieldTypes(expectedFields, fieldTypes)) {
            throw new Error(`defineVariants case "${name}" must contain the same fields and field types as the first case.`);
        }
        variants[name] = fields;
    }
    if (Object.keys(variants).length === 0) {
        throw new Error('defineVariants requires at least one case.');
    }
    return variants;
}

function sameFieldTypes(left: Record<string, string>, right: Record<string, string>) {
    const leftEntries = Object.entries(left);
    return leftEntries.length === Object.keys(right).length
        && leftEntries.every(([name, type]) => right[name] === type);
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
    if (
        ts.isAsExpression(expression)
        || ts.isTypeAssertionExpression(expression)
        || ts.isSatisfiesExpression(expression)
        || ts.isParenthesizedExpression(expression)
    ) {
        return unwrapExpression(expression.expression);
    }
    return expression;
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

function assertStaticPropMember(member: ts.ClassElement, name: string) {
    const isDeclareProperty = ts.isPropertyDeclaration(member)
        && member.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword)
        && !member.modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.AccessorKeyword)
        && !member.initializer;
    if (!isDeclareProperty) {
        throw new Error(`@prop "${name}" must decorate a declare property without an initializer.`);
    }
    if (!member.type) {
        throw new Error(`@prop "${name}" requires an explicit TypeScript property type.`);
    }
}

function propContract(
    prop: DecoratorObjectValue,
    member: ts.ClassElement,
    structClasses: ReadonlyMap<string, StructClassInfo>,
    variantDeclarations: ReadonlyMap<string, SceneTemplateVariants>,
): SceneTemplatePropContract {
    if (!ts.isPropertyDeclaration(member) || !member.type) {
        throw new Error('@prop requires a typed declare property.');
    }
    if (prop.type !== undefined) {
        throw new Error('@prop type is inferred from the TypeScript property declaration; remove the type option.');
    }

    const defaultValue = prop.default;
    const variantsReference = prop.variants;
    if (variantsReference !== undefined) {
        if (!isIdentifierValue(variantsReference)) {
            throw new Error('@prop variants must reference a local defineVariants declaration.');
        }
        const variants = variantDeclarations.get(variantsReference.text);
        if (!variants) {
            throw new Error(`@prop variants "${variantsReference.text}" must reference a local defineVariants declaration.`);
        }
        if (typeof defaultValue !== 'string' || !variants[defaultValue]) {
            throw new Error('@prop Variant default must name an existing defineVariants case.');
        }
        assertVariantPropertyType(member.type, variantsReference.text);
        return {
            type: 'variant',
            default: defaultValue,
            variants,
        };
    }

    const primitiveType = primitivePropertyType(member.type);
    if (primitiveType) {
        if (defaultValue !== undefined && (!isSceneTemplateScalarValue(defaultValue) || sceneTemplateScalarType(defaultValue) !== primitiveType)) {
            throw new Error(`@prop default must be a ${primitiveType} literal.`);
        }
        return {
            type: primitiveType,
            ...(defaultValue !== undefined ? { default: defaultValue } : {}),
        };
    }

    const structName = typeReferenceName(member.type);
    if (!structName) {
        throw new Error('@prop type must be string, number, boolean, a local struct class, or keyof a local defineVariants declaration.');
    }

    const structClass = structClasses.get(structName);
    if (!structClass) {
        throw new Error(`Struct prop type ${structName} was not found.`);
    }
    if (!structClass.exported) {
        throw new Error(`Struct prop type ${structName} must be exported.`);
    }
    if (defaultValue !== undefined) {
        throw new Error('@prop default is only supported for primitive props.');
    }
    const struct = structContractInfo(structClass.node);
    if (struct.hasRequiredConstructorParameters) {
        throw new Error(`Struct prop type ${structName} must be constructable with no required parameters.`);
    }
    return {
        type: 'struct',
        struct: structName,
        fields: struct.fields,
    };
}

function assertVariantPropertyType(type: ts.TypeNode, variantsName: string) {
    if (
        !ts.isTypeOperatorNode(type)
        || type.operator !== ts.SyntaxKind.KeyOfKeyword
        || !ts.isTypeQueryNode(type.type)
        || !ts.isIdentifier(type.type.exprName)
        || type.type.exprName.text !== variantsName
    ) {
        throw new Error(`@prop Variant type must be "keyof typeof ${variantsName}".`);
    }
}

function primitivePropertyType(type: ts.TypeNode): SceneTemplatePrimitivePropType | undefined {
    if (type.kind === ts.SyntaxKind.StringKeyword) {
        return 'string';
    }
    if (type.kind === ts.SyntaxKind.NumberKeyword) {
        return 'number';
    }
    if (type.kind === ts.SyntaxKind.BooleanKeyword) {
        return 'boolean';
    }
    return undefined;
}

function typeReferenceName(type: ts.TypeNode) {
    return ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)
        ? type.typeName.text
        : undefined;
}

function structContractInfo(node: ts.ClassDeclaration): StructContractInfo {
    return {
        fields: structFields(node),
        hasRequiredConstructorParameters: node.members.some((member) => ts.isConstructorDeclaration(member) && member.parameters.some((parameter) => !parameter.questionToken && !parameter.initializer)),
    };
}

function isIdentifierValue(value: DecoratorValue): value is ts.Identifier {
    return typeof value === 'object' && ts.isIdentifier(value as ts.Node);
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

function literalValue(expression: ts.Expression, label: string): SceneTemplateScalarValue {
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
