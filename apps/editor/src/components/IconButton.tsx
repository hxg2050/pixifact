import type { SystemIconButtonProps, SystemIconName } from './system';
import { IconButton as SystemIconButton, SystemIcon } from './system';

export type IconName = Extract<
    SystemIconName,
    'undo' | 'redo' | 'lock' | 'unlock' | 'download' | 'upload' | 'check' | 'plus' | 'edit' | 'trash'
>;

interface IconButtonProps extends Omit<SystemIconButtonProps, 'icon'> {
    icon: IconName;
}

export function Icon({ name }: { name: IconName }) {
    return <SystemIcon name={name} />;
}

export function IconButton(props: IconButtonProps) {
    return <SystemIconButton {...props} />;
}
