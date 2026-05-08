import type { ComponentType, SVGProps } from 'react';
import {
    ArrowDown,
    ArrowUp,
    Check,
    Download,
    Edit3,
    Ellipsis,
    Eye,
    FolderOpen,
    ExternalLink,
    FolderPlus,
    Languages,
    Lock,
    Play,
    Plus,
    Redo2,
    RefreshCw,
    RotateCcw,
    Save,
    Trash2,
    Undo2,
    Unlock,
    Upload,
} from 'lucide-react';

export type SystemIconName =
    | 'arrow-down'
    | 'arrow-up'
    | 'check'
    | 'download'
    | 'edit'
    | 'eye'
    | 'external'
    | 'folder-open'
    | 'more'
    | 'folder-plus'
    | 'languages'
    | 'lock'
    | 'play'
    | 'plus'
    | 'redo'
    | 'refresh'
    | 'reset'
    | 'save'
    | 'trash'
    | 'undo'
    | 'unlock'
    | 'upload';

const iconComponents: Record<SystemIconName, ComponentType<SVGProps<SVGSVGElement>>> = {
    'arrow-down': ArrowDown,
    'arrow-up': ArrowUp,
    check: Check,
    download: Download,
    edit: Edit3,
    eye: Eye,
    external: ExternalLink,
    'folder-open': FolderOpen,
    more: Ellipsis,
    'folder-plus': FolderPlus,
    languages: Languages,
    lock: Lock,
    play: Play,
    plus: Plus,
    redo: Redo2,
    refresh: RefreshCw,
    reset: RotateCcw,
    save: Save,
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
