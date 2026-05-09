import type { ComponentType, SVGProps } from 'react';
import {
    ArrowDown,
    ArrowUp,
    Check,
    Circle,
    Download,
    Edit3,
    Ellipsis,
    Eye,
    FolderOpen,
    ExternalLink,
    FolderPlus,
    Image,
    LetterText,
    Languages,
    Lock,
    Play,
    Plus,
    Redo2,
    RefreshCw,
    RotateCcw,
    Save,
    Square,
    TextCursorInput,
    Trash2,
    Undo2,
    Unlock,
    Upload,
} from 'lucide-react';

export type SystemIconName =
    | 'arrow-down'
    | 'arrow-up'
    | 'check'
    | 'circle'
    | 'download'
    | 'edit'
    | 'eye'
    | 'external'
    | 'folder-open'
    | 'more'
    | 'folder-plus'
    | 'image'
    | 'input'
    | 'letter-text'
    | 'languages'
    | 'lock'
    | 'play'
    | 'plus'
    | 'redo'
    | 'refresh'
    | 'reset'
    | 'save'
    | 'square'
    | 'trash'
    | 'undo'
    | 'unlock'
    | 'upload';

const iconComponents: Record<SystemIconName, ComponentType<SVGProps<SVGSVGElement>>> = {
    'arrow-down': ArrowDown,
    'arrow-up': ArrowUp,
    check: Check,
    circle: Circle,
    download: Download,
    edit: Edit3,
    eye: Eye,
    external: ExternalLink,
    'folder-open': FolderOpen,
    more: Ellipsis,
    'folder-plus': FolderPlus,
    image: Image,
    input: TextCursorInput,
    'letter-text': LetterText,
    languages: Languages,
    lock: Lock,
    play: Play,
    plus: Plus,
    redo: Redo2,
    refresh: RefreshCw,
    reset: RotateCcw,
    save: Save,
    square: Square,
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
