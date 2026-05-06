import { component } from "./dsl";

export function roundedRect(props: Record<string, unknown> = {}, id?: string) {
    return component('ui.RoundedRectGraphic', props, id);
}

export function textGraphic(props: Record<string, unknown> = {}, id?: string) {
    return component('ui.TextGraphic', props, id);
}

export function imageGraphic(props: Record<string, unknown> = {}, id?: string) {
    return component('ui.ImageGraphic', props, id);
}

export function button(props: Record<string, unknown> = {}, id?: string) {
    return component('ui.Button', props, id);
}

export function progressBar(props: Record<string, unknown> = {}, id?: string) {
    return component('ui.ProgressBar', props, id);
}

export function scrollRect(props: Record<string, unknown> = {}, id?: string) {
    return component('ui.ScrollRect', props, id);
}

export function inputField(props: Record<string, unknown> = {}, id?: string) {
    return component('ui.InputField', props, id);
}
