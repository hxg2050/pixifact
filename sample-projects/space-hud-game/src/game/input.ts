export interface InputState {
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
    fire: boolean;
}

export function createInputState(): InputState {
    return {
        left: false,
        right: false,
        up: false,
        down: false,
        fire: false,
    };
}

export function attachKeyboardInput(input: InputState) {
    const update = (event: KeyboardEvent, active: boolean) => {
        if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') input.left = active;
        if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') input.right = active;
        if (event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W') input.up = active;
        if (event.key === 'ArrowDown' || event.key === 's' || event.key === 'S') input.down = active;
        if (event.key === ' ' || event.key === 'Enter') input.fire = active;
    };
    const onKeyDown = (event: KeyboardEvent) => update(event, true);
    const onKeyUp = (event: KeyboardEvent) => update(event, false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
    };
}
