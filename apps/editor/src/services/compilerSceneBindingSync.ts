export function isCompilerBindingSourceChange(event: { path: string; kind: string }) {
    return event.kind === 'scene'
        || event.path.startsWith('src/scenes/')
        || event.path.includes('/src/scenes/');
}
