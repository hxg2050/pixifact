import {
    createElement,
    forwardRef,
} from 'react';
import type {
    HTMLAttributes,
    ReactNode,
} from 'react';
import {
    DropZone as AriaDropZone,
    useDrag,
} from 'react-aria-components';
import type {
    DropItem,
    DropOperation,
    DropZoneProps as AriaDropZoneProps,
    DropZoneRenderProps,
    DragOptions,
} from 'react-aria-components';

type SystemDragItem = Record<string, string>;

export interface SystemDragPayload {
    data: string;
    label?: string;
    type: string;
}

export interface SystemDropPayload extends SystemDragPayload {
    item: DropItem;
}

interface DragSourceProps extends Omit<HTMLAttributes<HTMLElement>, 'children' | 'onDragEnd' | 'onDragStart'> {
    as?: 'button' | 'div';
    children?: ReactNode;
    disabled?: boolean;
    getAllowedDropOperations?: () => DropOperation[];
    onSystemDragEnd?: DragOptions['onDragEnd'];
    onSystemDragStart?: DragOptions['onDragStart'];
    payload?: SystemDragPayload;
    type?: string;
}

interface DropZoneProps extends Omit<AriaDropZoneProps, 'children' | 'className' | 'getDropOperation' | 'isDisabled' | 'onDrop'> {
    acceptedTypes: readonly string[];
    children?: ReactNode | ((props: DropZoneRenderProps) => ReactNode);
    className?: string | ((props: DropZoneRenderProps) => string);
    disabled?: boolean;
    getDropOperation?: (types: { has(type: string | symbol): boolean }, allowedOperations: DropOperation[]) => DropOperation;
    onDropMove?: AriaDropZoneProps['onDropMove'];
    onPayloadDrop(payload: SystemDropPayload): void | Promise<void>;
}

function dragItemFromPayload(payload: SystemDragPayload): SystemDragItem {
    return {
        [payload.type]: payload.data,
        'text/plain': payload.label ?? payload.data,
    };
}

function acceptsAnyType(types: { has(type: string | symbol): boolean }, acceptedTypes: readonly string[]) {
    return acceptedTypes.some((type) => types.has(type));
}

async function readPayload(items: DropItem[], acceptedTypes: readonly string[]): Promise<SystemDropPayload | undefined> {
    for (const item of items) {
        if (item.kind !== 'text') {
            continue;
        }

        for (const type of acceptedTypes) {
            if (item.types.has(type)) {
                return {
                    data: await item.getText(type),
                    item,
                    type,
                };
            }
        }
    }

    return undefined;
}

export function DragSource({
    as = 'div',
    children,
    className,
    disabled,
    getAllowedDropOperations = () => ['copy'],
    payload,
    ...props
}: DragSourceProps) {
    if (!payload) {
        return createElement(
            as,
            {
                ...props,
                className: [
                    'systemDragSource',
                    className ?? '',
                ].filter(Boolean).join(' '),
                disabled: as === 'button' ? disabled : undefined,
                type: as === 'button' ? props.type ?? 'button' : undefined,
            },
            children,
        );
    }

    return (
        <ActiveDragSource
            {...props}
            as={as}
            className={className}
            disabled={disabled}
            getAllowedDropOperations={getAllowedDropOperations}
            payload={payload}
        >
            {children}
        </ActiveDragSource>
    );
}

function ActiveDragSource({
    as = 'div',
    children,
    className,
    disabled,
    getAllowedDropOperations = () => ['copy'],
    onSystemDragEnd,
    onSystemDragStart,
    payload,
    ...props
}: DragSourceProps & { payload: SystemDragPayload }) {
    const { dragProps, isDragging } = useDrag({
        getAllowedDropOperations,
        getItems: () => payload ? [dragItemFromPayload(payload)] : [],
        hasDragButton: true,
        onDragEnd: onSystemDragEnd,
        onDragStart: onSystemDragStart,
        isDisabled: disabled,
    });
    const classes = [
        'systemDragSource',
        className ?? '',
    ].filter(Boolean).join(' ');

    return createElement(
        as,
        {
            ...props,
            ...dragProps,
            className: classes,
            'data-dragging': isDragging || undefined,
            disabled: as === 'button' ? disabled : undefined,
            type: as === 'button' ? props.type ?? 'button' : undefined,
        },
        children,
    );
}

export const DropZone = forwardRef<HTMLDivElement, DropZoneProps>(function DropZone({
    acceptedTypes,
    children,
    className,
    disabled,
    getDropOperation,
    onDropMove,
    onPayloadDrop,
    ...props
}, ref) {
    return (
        <AriaDropZone
            {...props}
            className={(renderProps) => [
                'systemDropZone',
                typeof className === 'function' ? className(renderProps) : className ?? '',
            ].filter(Boolean).join(' ')}
            getDropOperation={(types, allowedOperations) => {
                if (!acceptsAnyType(types, acceptedTypes)) {
                    return 'cancel';
                }
                if (getDropOperation) {
                    return getDropOperation(types, allowedOperations);
                }
                return allowedOperations.includes('copy') ? 'copy' : allowedOperations[0] ?? 'copy';
            }}
            isDisabled={disabled}
            onDropMove={onDropMove}
            onDrop={async (event) => {
                const payload = await readPayload(event.items, acceptedTypes);
                if (payload) {
                    await onPayloadDrop(payload);
                }
            }}
            ref={ref}
        >
            {children}
        </AriaDropZone>
    );
});
