import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h, markRaw, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import InspectorPanel from '../apps/editor/src/panels/InspectorPanel.vue';
import { SceneDocument } from '../apps/editor/src/document/SceneDocument';
import { useEditorUiStore } from '../apps/editor/src/stores/editorUi';

const source = [
    '<Scene name="Menu">',
    '  <Text id="title" x="20" text="开始" />',
    '</Scene>',
    '',
].join('\n');

function createApi() {
    return {
        readScene: vi.fn(async () => ({
            path: 'src/scenes/Menu.scene',
            source,
            version: 'sha256:before',
        })),
        writeScene: vi.fn(async () => ({
            path: 'src/scenes/Menu.scene',
            version: 'sha256:after',
        })),
    };
}

describe('Editor Vue UI', () => {
    it('keeps only UI state in Pinia', () => {
        setActivePinia(createPinia());

        const state = useEditorUiStore().$state;

        expect(Object.keys(state).sort()).toEqual([
            'activeLeftTab',
            'currentScenePath',
            'selectedLocator',
            'syncState',
        ]);
        expect(state).not.toHaveProperty('source');
        expect(state).not.toHaveProperty('template');
    });

    it('previews Inspector input and commits it on blur', async () => {
        const api = createApi();
        const document = markRaw(await SceneDocument.open('src/scenes/Menu.scene', api));
        const events: unknown[] = [];
        const revision = ref(0);
        document.subscribe((event) => {
            events.push(event);
            if (event.type === 'commandApplied') {
                revision.value += 1;
            }
        });
        const wrapper = mount(defineComponent({
            setup() {
                return () => h(InspectorPanel, {
                    document,
                    revision: revision.value,
                    selected: '0:title',
                });
            },
        }));
        const input = wrapper.get('input[data-prop="x"]');

        (input.element as HTMLInputElement).value = '48';
        await input.trigger('input');

        expect(events).toContainEqual({
            type: 'nodePropPreview',
            locator: '0:title',
            prop: 'x',
            value: 48,
        });
        expect(api.writeScene).not.toHaveBeenCalled();

        await input.trigger('blur');
        await flushPromises();

        expect(api.writeScene).toHaveBeenCalledTimes(1);
        expect(api.writeScene.mock.calls[0]?.[1]).toContain('x="48"');
        expect((wrapper.get('input[data-prop="x"]').element as HTMLInputElement).value).toBe('48');
        wrapper.unmount();
    });

    it('does not replace newer input when an earlier save finishes', async () => {
        const api = createApi();
        let finishWrite!: (value: { path: string; version: string }) => void;
        api.writeScene.mockImplementationOnce(() => new Promise((resolve) => {
            finishWrite = resolve;
        }));
        const document = markRaw(await SceneDocument.open('src/scenes/Menu.scene', api));
        const revision = ref(0);
        document.subscribe((event) => {
            if (event.type === 'commandApplied') {
                revision.value += 1;
            }
        });
        const wrapper = mount(defineComponent({
            setup() {
                return () => h(InspectorPanel, {
                    document,
                    revision: revision.value,
                    selected: '0:title',
                });
            },
        }));
        const input = wrapper.get('input[data-prop="x"]');
        (input.element as HTMLInputElement).value = '48';
        await input.trigger('input');
        await input.trigger('blur');
        await vi.waitFor(() => expect(api.writeScene).toHaveBeenCalledTimes(1));

        const latestInput = wrapper.get('input[data-prop="x"]');
        (latestInput.element as HTMLInputElement).value = '56';
        await latestInput.trigger('input');
        finishWrite({ path: 'src/scenes/Menu.scene', version: 'sha256:after' });
        await flushPromises();

        expect((wrapper.get('input[data-prop="x"]').element as HTMLInputElement).value).toBe('56');
        wrapper.unmount();
    });
});
