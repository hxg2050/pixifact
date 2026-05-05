import type { ButtonHTMLAttributes } from 'react';
import { Icon } from './IconButton';
import type { IconName } from './IconButton';

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    icon: IconName;
    label: string;
    variant?: 'default' | 'primary';
}

export function ActionButton({
    icon,
    label,
    variant = 'default',
    className,
    title,
    type = 'button',
    ...props
}: ActionButtonProps) {
    const classes = ['actionButton', variant === 'primary' ? 'primaryButton' : '', className ?? '']
        .filter(Boolean)
        .join(' ');

    return (
        <button
            className={classes}
            title={title ?? label}
            type={type}
            {...props}
        >
            <Icon name={icon} />
            <span>{label}</span>
        </button>
    );
}
