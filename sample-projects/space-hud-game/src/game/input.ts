export interface InputState {
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
    fire: boolean;
}

const keys: Record<string, keyof InputState> = {
    ArrowLeft: 'left',
    KeyA: 'left',
    ArrowRight: 'right',
    KeyD: 'right',
    ArrowUp: 'up',
    KeyW: 'up',
    ArrowDown: 'down',
    KeyS: 'down',
    Space: 'fire',
};

export function createInputState(): InputState {
    const state: InputState = {
        left: false,
        right: false,
        up: false,
        down: false,
        fire: false,
    };

    window.addEventListener('keydown', (event) => {
        const key = keys[event.code];
        if (key) {
            state[key] = true;
        }
    });
    window.addEventListener('keyup', (event) => {
        const key = keys[event.code];
        if (key) {
            state[key] = false;
        }
    });

    return state;
}
