import type { ReactNode } from 'react';
import {
    Tooltip as AriaTooltip,
    TooltipTrigger as AriaTooltipTrigger,
} from 'react-aria-components';
import type { TooltipProps, TooltipTriggerComponentProps } from 'react-aria-components';

interface SystemTooltipProps extends Omit<TooltipProps, 'children' | 'className'> {
    children: ReactNode;
    className?: string;
}

export function Tooltip({ children, className, ...props }: SystemTooltipProps) {
    const classes = ['systemTooltip', className ?? ''].filter(Boolean).join(' ');
    return (
        <AriaTooltip className={classes} {...props}>
            {children}
        </AriaTooltip>
    );
}

export function TooltipTrigger(props: TooltipTriggerComponentProps) {
    return <AriaTooltipTrigger {...props} />;
}
