import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h, markRaw, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { SceneTemplateInterface } from 'pixifact/compiler';
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

    it('edits primitive and Variant Props declared by a Scene Instance contract', async () => {
        const api = createApi();
        api.readScene.mockResolvedValueOnce({
            path: 'src/scenes/Toolbar.scene',
            source: [
                '<Scene name="Toolbar">',
                '  <Button id="inventory" scene="./Button.scene" label="背包" tone="danger" />',
                '</Scene>',
                '',
            ].join('\n'),
            version: 'sha256:before',
        });
        const document = markRaw(await SceneDocument.open('src/scenes/Toolbar.scene', api));
        const events: unknown[] = [];
        document.subscribe((event) => events.push(event));
        const sceneInterfaces: Record<string, SceneTemplateInterface> = {
            'src/scenes/Button.scene': {
                props: {
                    label: { type: 'string', default: 'Button' },
                    tone: {
                        type: 'variant',
                        default: 'primary',
                        variants: {
                            primary: { background: '#24456f' },
                            danger: { background: '#713044' },
                        },
                    },
                },
                events: {},
                slots: {},
            },
        };
        const wrapper = mount(InspectorPanel, {
            props: {
                document,
                revision: 0,
                sceneInterfaces,
                selected: '0:inventory',
            },
        });

        const label = wrapper.get('input[data-prop="label"]');
        const tone = wrapper.get('select[data-prop="tone"]');
        expect((label.element as HTMLInputElement).value).toBe('背包');
        expect((tone.element as HTMLSelectElement).value).toBe('danger');
        expect(tone.findAll('option').map((option) => option.text())).toEqual(['primary', 'danger']);

        (label.element as HTMLInputElement).value = '仓库';
        await label.trigger('input');
        expect(events).toContainEqual({
            type: 'nodePropPreview',
            locator: '0:inventory',
            prop: 'label',
            value: '仓库',
        });
        wrapper.unmount();
    });

    it('shows resolved Binding targets as read-only and detaches them to literal values', async () => {
        const api = createApi();
        api.readScene.mockResolvedValueOnce({
            path: 'src/scenes/Button.scene',
            source: [
                '<Scene name="Button">',
                '  <Rect id="background" fillColor="{tone.background}" />',
                '  <Text id="labelText" text="{label}" />',
                '</Scene>',
                '',
            ].join('\n'),
            version: 'sha256:before',
        });
        const document = markRaw(await SceneDocument.open('src/scenes/Button.scene', api));
        const revision = ref(0);
        document.subscribe((event) => {
            if (event.type === 'commandApplied') {
                revision.value += 1;
            }
        });
        const sceneInterfaces: Record<string, SceneTemplateInterface> = {
            'src/scenes/Button.scene': {
                props: {
                    label: { type: 'string', default: 'Button' },
                    tone: {
                        type: 'variant',
                        default: 'primary',
                        variants: {
                            primary: { background: '#24456f' },
                            danger: { background: '#713044' },
                        },
                    },
                },
                events: {},
                slots: {},
            },
        };
        const selected = ref('1:labelText');
        const wrapper = mount(defineComponent({
            setup() {
                return () => h(InspectorPanel, {
                    document,
                    revision: revision.value,
                    sceneInterfaces,
                    selected: selected.value,
                });
            },
        }));

        const text = wrapper.get('input[data-prop="text"]');
        expect((text.element as HTMLInputElement).value).toBe('Button');
        expect((text.element as HTMLInputElement).disabled).toBe(true);
        expect(wrapper.get('[data-binding-source="text"]').text()).toBe('绑定：label');

        selected.value = '0:background';
        await flushPromises();

        const fillColor = wrapper.get('input[data-prop="fillColor"]');
        expect((fillColor.element as HTMLInputElement).value).toBe('#24456f');
        expect((fillColor.element as HTMLInputElement).disabled).toBe(true);
        expect(wrapper.get('[data-binding-source="fillColor"]').text()).toBe('绑定：tone.background');

        await wrapper.get('button[data-unbind-prop="fillColor"]').trigger('click');
        await flushPromises();

        expect(api.writeScene).toHaveBeenCalledTimes(1);
        expect(api.writeScene.mock.calls[0]?.[1]).toContain('fillColor="#24456f"');
        expect(document.source).not.toContain('fillColor="{tone.background}"');
        expect(wrapper.find('[data-binding-source="fillColor"]').exists()).toBe(false);
        expect((wrapper.get('input[data-prop="fillColor"]').element as HTMLInputElement).disabled).toBe(false);

        await document.undo();
        await flushPromises();

        expect(document.source).toContain('fillColor="{tone.background}"');
        expect(api.writeScene).toHaveBeenCalledTimes(2);
        expect(wrapper.get('[data-binding-source="fillColor"]').text()).toBe('绑定：tone.background');
        expect((wrapper.get('input[data-prop="fillColor"]').element as HTMLInputElement).disabled).toBe(true);
        wrapper.unmount();
    });
});
