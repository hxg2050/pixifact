export function isCompilerBindingSourceChange(event: { path: string; kind: string }) {
    return event.kind === 'scene' || event.path.endsWith('.ts') || event.path.endsWith('.tsx');
}
