import type { ReactNode } from 'react';
import {
    Checkbox as AriaCheckbox,
} from 'react-aria-components';
import type { CheckboxProps as AriaCheckboxProps } from 'react-aria-components';

interface SystemCheckboxProps extends Omit<AriaCheckboxProps, 'children' | 'className'> {
    className?: string;
    disabled?: boolean;
    label?: ReactNode;
}

export function Checkbox({
    className,
    disabled,
    label,
    ...props
}: SystemCheckboxProps) {
    const classes = ['systemCheckbox', className ?? ''].filter(Boolean).join(' ');

    return (
        <AriaCheckbox
            aria-label={!label ? props['aria-label'] : undefined}
            className={classes}
            isDisabled={disabled ?? props.isDisabled}
            {...props}
        >
            <span className="systemCheckboxIndicator" aria-hidden="true" />
            {label ? <span>{label}</span> : null}
        </AriaCheckbox>
    );
}
