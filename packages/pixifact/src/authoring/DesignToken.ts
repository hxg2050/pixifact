export interface DesignTokenSpec {
    colors?: Record<string, number>;
    spacing?: Record<string, number>;
    radius?: Record<string, number>;
    typography?: Record<string, {
        fontFamily: string;
        fontSize: number;
        fontWeight?: string;
    }>;
}

export interface DesignTokenWarning {
    target: string;
    value: unknown;
    message: string;
}

function hasNumberValue(record: Record<string, number> | undefined, value: unknown) {
    return typeof value === 'number' && !!record && Object.values(record).includes(value);
}

export function validateDesignTokenValue(
    tokens: DesignTokenSpec | undefined,
    target: string,
    prop: string,
    value: unknown,
): DesignTokenWarning | undefined {
    if (!tokens) {
        return undefined;
    }

    if ((prop === 'color' || prop.toLowerCase().includes('color')) && !hasNumberValue(tokens.colors, value)) {
        return {
            target,
            value,
            message: `${target} uses color ${String(value)} outside design tokens.`,
        };
    }

    if ((prop === 'radius' || prop.toLowerCase().includes('radius')) && !hasNumberValue(tokens.radius, value)) {
        return {
            target,
            value,
            message: `${target} uses radius ${String(value)} outside design tokens.`,
        };
    }

    if ((prop === 'x' || prop === 'y' || prop === 'width' || prop === 'height') && typeof value === 'number' && tokens.spacing) {
        const spacingValues = Object.values(tokens.spacing);
        if (spacingValues.length > 0 && !spacingValues.some((spacing) => value % spacing === 0)) {
            return {
                target,
                value,
                message: `${target} uses ${prop}=${value}, which does not align to spacing tokens.`,
            };
        }
    }

    return undefined;
}
