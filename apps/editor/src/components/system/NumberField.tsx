import type { ReactNode } from 'react';
import {
    FieldError,
    Input,
    Label,
    NumberField as AriaNumberField,
    Text,
} from 'react-aria-components';
import type {
    InputProps,
    NumberFieldProps as AriaNumberFieldProps,
} from 'react-aria-components';

interface SystemNumberFieldProps extends Omit<AriaNumberFieldProps, 'children' | 'className'> {
    className?: string;
    'data-testid'?: string;
    description?: ReactNode;
    disabled?: boolean;
    errorMessage?: ReactNode;
    inputProps?: InputProps;
    label?: ReactNode;
}

export function NumberField({
    className,
    'data-testid': testId,
    description,
    disabled,
    errorMessage,
    inputProps,
    label,
    ...props
}: SystemNumberFieldProps) {
    const classes = ['systemNumberField', className ?? ''].filter(Boolean).join(' ');
    const fieldLabel = !label && typeof inputProps?.['aria-label'] === 'string'
        ? inputProps['aria-label']
        : undefined;

    return (
        <AriaNumberField
            aria-label={props['aria-label'] ?? fieldLabel}
            className={classes}
            isDisabled={disabled ?? props.isDisabled}
            {...props}
        >
            {label ? <Label>{label}</Label> : null}
            <Input data-testid={testId} {...inputProps} />
            {description ? <Text slot="description">{description}</Text> : null}
            {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
        </AriaNumberField>
    );
}
