import type { ComponentType, SVGProps } from 'react';
import {
    Check,
    Download,
    Edit3,
    Ellipsis,
    ExternalLink,
    FolderPlus,
    Lock,
    Plus,
    Redo2,
    RefreshCw,
    RotateCcw,
    Trash2,
    Undo2,
    Unlock,
    Upload,
} from 'lucide-react';

export type SystemIconName =
    | 'check'
    | 'download'
    | 'edit'
    | 'external'
    | 'more'
    | 'folder-plus'
    | 'lock'
    | 'plus'
    | 'redo'
    | 'refresh'
    | 'reset'
    | 'trash'
    | 'undo'
    | 'unlock'
    | 'upload';

const iconComponents: Record<SystemIconName, ComponentType<SVGProps<SVGSVGElement>>> = {
    check: Check,
    download: Download,
    edit: Edit3,
    external: ExternalLink,
    more: Ellipsis,
    'folder-plus': FolderPlus,
    lock: Lock,
    plus: Plus,
    redo: Redo2,
    refresh: RefreshCw,
    reset: RotateCcw,
    trash: Trash2,
    undo: Undo2,
    unlock: Unlock,
    upload: Upload,
};

export interface SystemIconProps extends SVGProps<SVGSVGElement> {
    name: SystemIconName;
}

export function SystemIcon({ name, className, ...props }: SystemIconProps) {
    const Icon = iconComponents[name];
    const classes = ['systemIcon', className ?? ''].filter(Boolean).join(' ');
    return <Icon aria-hidden="true" className={classes} focusable="false" {...props} />;
}
