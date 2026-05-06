import type { ReactNode } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import type { ButtonProps as AriaButtonProps } from 'react-aria-components';
import { SystemIcon } from './icons';
import type { SystemIconName } from './icons';

export type SystemButtonVariant = 'default' | 'primary' | 'subtle' | 'danger';

export interface SystemButtonProps extends Omit<AriaButtonProps, 'className'> {
    className?: string;
    disabled?: boolean;
    icon?: SystemIconName;
    title?: string;
    variant?: SystemButtonVariant;
    children?: ReactNode;
}

export function Button({
    className,
    disabled,
    icon,
    variant = 'default',
    children,
    ...props
}: SystemButtonProps) {
    const classes = [
        'systemButton',
        variant !== 'default' ? `systemButton--${variant}` : '',
        icon && children ? 'systemButton--withIcon' : '',
        className ?? '',
    ].filter(Boolean).join(' ');

    return (
        <AriaButton className={classes} isDisabled={disabled ?? props.isDisabled} {...props}>
            {icon ? <SystemIcon name={icon} /> : null}
            {children ? <span>{children}</span> : null}
        </AriaButton>
    );
}
