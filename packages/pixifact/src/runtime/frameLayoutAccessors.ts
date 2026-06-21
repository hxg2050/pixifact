import type { Container } from 'pixi.js';
import {
    getFrameLayout,
    setFrameLayout,
    type FrameLayoutProp,
} from './frameLayout';

export function frameLayoutProp(target: object, prop: FrameLayoutProp) {
    return getFrameLayout(target)[prop];
}

export function setFrameLayoutProp(target: Container, prop: FrameLayoutProp, value: number | undefined) {
    setFrameLayout(target, { [prop]: value });
}
