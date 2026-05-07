import type { ReactNode } from 'react';
import {
    Button as AriaButton,
    FieldError,
    Label,
    ListBox,
    ListBoxItem,
    Popover,
    Select as AriaSelect,
    SelectValue,
    Text,
} from 'react-aria-components';
import type {
    Key,
    SelectProps as AriaSelectProps,
} from 'react-aria-components';

const emptySelectionKey = '__pixifact_empty_selection__';

export interface SystemSelectOption {
    disabled?: boolean;
    label: string;
    value: string;
}

interface SystemSelectProps extends Omit<AriaSelectProps<SystemSelectOption>, 'children' | 'className' | 'items' | 'onSelectionChange' | 'selectedKey'> {
    className?: string;
    description?: ReactNode;
    disabled?: boolean;
    errorMessage?: ReactNode;
    label?: ReactNode;
    onSelectionChange?(key: string): void;
    options: readonly SystemSelectOption[];
    selectedKey?: string;
}

function toInternalKey(value: string | undefined) {
    return value === undefined || value === '' ? emptySelectionKey : value;
}

function fromInternalKey(key: Key) {
    const value = String(key);
    return value === emptySelectionKey ? '' : value;
}

export function Select({
    className,
    description,
    disabled,
    errorMessage,
    label,
    onSelectionChange,
    options,
    selectedKey,
    ...props
}: SystemSelectProps) {
    const classes = ['systemSelect', className ?? ''].filter(Boolean).join(' ');
    const internalOptions = options.map((option) => ({
        ...option,
        value: toInternalKey(option.value),
    }));

    return (
        <AriaSelect
            aria-label={!label ? props['aria-label'] : undefined}
            className={classes}
            isDisabled={disabled ?? props.isDisabled}
            onSelectionChange={(key) => {
                if (key !== null) {
                    onSelectionChange?.(fromInternalKey(key));
                }
            }}
            selectedKey={toInternalKey(selectedKey)}
            {...props}
        >
            {label ? <Label>{label}</Label> : null}
            <AriaButton className="systemSelectButton">
                <SelectValue />
            </AriaButton>
            {description ? <Text slot="description">{description}</Text> : null}
            {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
            <Popover className="systemSelectPopover">
                <ListBox className="systemSelectList">
                    {internalOptions.map((option) => (
                        <ListBoxItem
                            id={option.value}
                            isDisabled={option.disabled}
                            key={option.value}
                            textValue={option.label}
                        >
                            {option.label}
                        </ListBoxItem>
                    ))}
                </ListBox>
            </Popover>
        </AriaSelect>
    );
}
