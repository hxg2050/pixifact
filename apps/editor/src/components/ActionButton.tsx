import type { ButtonProps as AriaButtonProps } from 'react-aria-components';
import { Button } from './system';
import type { IconName } from './IconButton';

interface ActionButtonProps extends Omit<AriaButtonProps, 'className' | 'children'> {
    className?: string;
    icon: IconName;
    label: string;
    title?: string;
    variant?: 'default' | 'primary';
}

export function ActionButton({
    icon,
    label,
    variant = 'default',
    className,
    title,
    ...props
}: ActionButtonProps) {
    const classes = ['actionButton', variant === 'primary' ? 'primaryButton' : '', className ?? '']
        .filter(Boolean)
        .join(' ');

    return (
        <Button
            className={classes}
            icon={icon}
            title={title ?? label}
            variant={variant}
            {...props}
        >
            {label}
        </Button>
    );
}
