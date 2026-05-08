
export type Props<T> = {
    [P in keyof T]?: Props<T[P]>;
};

/**
 * 快速设置
 * @param obj 
 * @param props 
 */
export function setProps<T extends object>(obj: T, props: Partial<T>) {
    for (let key in props) {
        const value = props[key];
        // if (typeof value === 'object') {
        //     setProps(obj[key], value!);
        //     continue;
        // }
        obj[key] = value as any;
    }
    return obj;
}

export const sp = setProps;