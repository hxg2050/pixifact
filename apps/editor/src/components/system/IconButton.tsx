import type { ButtonProps as AriaButtonProps } from 'react-aria-components';
import { Button } from './Button';
import { SystemIcon } from './icons';
import type { SystemIconName } from './icons';

export interface SystemIconButtonProps extends Omit<AriaButtonProps, 'className' | 'children'> {
    active?: boolean;
    className?: string;
    disabled?: boolean;
    icon: SystemIconName;
    label: string;
    title?: string;
}

export function IconButton({
    active = false,
    className,
    icon,
    label,
    ...props
}: SystemIconButtonProps) {
    const classes = ['iconButton', active ? 'active' : '', className ?? '']
        .filter(Boolean)
        .join(' ');

    return (
        <Button
            aria-label={label}
            className={classes}
            title={label}
            {...props}
        >
            <SystemIcon name={icon} />
        </Button>
    );
}
