export const onlyOnceQueueMicrotask = <TArgs extends unknown[]>(fn: (...args: TArgs) => void): ((...args: TArgs) => void) => {
    let run = false;
    return ((...args: TArgs) => {
        if (!run) {
            run = true;
            queueMicrotask(() => {
                fn(...args);
                run = false;
            });
        }
    })
}
