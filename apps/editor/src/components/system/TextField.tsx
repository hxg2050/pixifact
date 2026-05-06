import type { ReactNode } from 'react';
import {
    FieldError,
    Input,
    Label,
    Text,
    TextField as AriaTextField,
} from 'react-aria-components';
import type { InputProps, TextFieldProps as AriaTextFieldProps } from 'react-aria-components';

interface SystemTextFieldProps extends Omit<AriaTextFieldProps, 'children' | 'className'> {
    className?: string;
    'data-testid'?: string;
    description?: ReactNode;
    disabled?: boolean;
    errorMessage?: ReactNode;
    inputProps?: InputProps;
    label?: ReactNode;
}

export function TextField({
    className,
    'data-testid': testId,
    description,
    disabled,
    errorMessage,
    inputProps,
    label,
    ...props
}: SystemTextFieldProps) {
    const classes = ['systemTextField', className ?? ''].filter(Boolean).join(' ');
    const fieldLabel = !label && typeof inputProps?.['aria-label'] === 'string'
        ? inputProps['aria-label']
        : undefined;

    return (
        <AriaTextField
            aria-label={props['aria-label'] ?? fieldLabel}
            className={classes}
            isDisabled={disabled ?? props.isDisabled}
            {...props}
        >
            {label ? <Label>{label}</Label> : null}
            <Input data-testid={testId} {...inputProps} />
            {description ? <Text slot="description">{description}</Text> : null}
            {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
        </AriaTextField>
    );
}
