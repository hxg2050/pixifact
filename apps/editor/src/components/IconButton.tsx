import type { ButtonHTMLAttributes } from 'react';

export type IconName = 'undo' | 'redo' | 'lock' | 'unlock' | 'download' | 'upload' | 'check' | 'plus' | 'edit' | 'trash';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    icon: IconName;
    label: string;
    active?: boolean;
}

export function Icon({ name }: { name: IconName }) {
    switch (name) {
        case 'undo':
            return (
                <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M9 7H4v5" />
                    <path d="M4 12c2.1-3.8 5.2-5.6 9.1-5.2 3.8.4 6.1 2.8 6.9 7.2" />
                    <path d="M4 12l5-5" />
                </svg>
            );
        case 'redo':
            return (
                <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M15 7h5v5" />
                    <path d="M20 12c-2.1-3.8-5.2-5.6-9.1-5.2-3.8.4-6.1 2.8-6.9 7.2" />
                    <path d="M20 12l-5-5" />
                </svg>
            );
        case 'lock':
            return (
                <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M7 11V8a5 5 0 0 1 10 0v3" />
                    <path d="M6 11h12v9H6z" />
                    <path d="M12 15v2" />
                </svg>
            );
        case 'unlock':
            return (
                <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M8 11V8a4 4 0 0 1 7.5-2" />
                    <path d="M6 11h12v9H6z" />
                    <path d="M12 15v2" />
                </svg>
            );
        case 'download':
            return (
                <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M12 4v10" />
                    <path d="M8 10l4 4 4-4" />
                    <path d="M5 18h14" />
                </svg>
            );
        case 'upload':
            return (
                <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M12 20V10" />
                    <path d="M8 14l4-4 4 4" />
                    <path d="M5 6h14" />
                </svg>
            );
        case 'check':
            return (
                <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M5 12l4 4 10-10" />
                </svg>
            );
        case 'plus':
            return (
                <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                </svg>
            );
        case 'edit':
            return (
                <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M5 19l4.5-1 9-9a2.1 2.1 0 0 0-3-3l-9 9L5 19z" />
                    <path d="M14 7l3 3" />
                </svg>
            );
        case 'trash':
            return (
                <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M5 7h14" />
                    <path d="M9 7V5h6v2" />
                    <path d="M8 10v8" />
                    <path d="M12 10v8" />
                    <path d="M16 10v8" />
                    <path d="M7 7l1 13h8l1-13" />
                </svg>
            );
    }
}

export function IconButton({
    icon,
    label,
    active = false,
    className,
    type = 'button',
    ...props
}: IconButtonProps) {
    const classes = ['iconButton', active ? 'active' : '', className ?? '']
        .filter(Boolean)
        .join(' ');

    return (
        <button
            aria-label={label}
            className={classes}
            title={label}
            type={type}
            {...props}
        >
            <Icon name={icon} />
        </button>
    );
}
