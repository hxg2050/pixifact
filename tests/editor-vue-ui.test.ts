import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h, markRaw, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { parseSceneTemplate, type SceneTemplateInterface } from 'pixifact/compiler';
import HierarchyPanel from '../apps/editor/src/panels/HierarchyPanel.vue';
import InspectorPanel from '../apps/editor/src/panels/InspectorPanel.vue';
import { SceneDocument } from '../apps/editor/src/document/SceneDocument';
import { duplicateSceneNode } from '../apps/editor/src/document/sceneTree';
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
    it('assigns unique ids throughout a duplicated subtree', () => {
        const template = parseSceneTemplate([
            '<Scene name="Menu">',
            '  <Group id="panel"><Text id="title" /></Group>',
            '</Scene>',
        ].join('\n'));

        const copy = duplicateSceneNode(template, template.children[0]);

        expect(copy).toMatchObject({
            id: 'panel2',
            children: [{ id: 'title2' }],
        });
    });

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

    it('shows Label box and typography fields in the Inspector', async () => {
        const api = createApi();
        api.readScene.mockResolvedValueOnce({
            path: 'src/scenes/Menu.scene',
            source: [
                '<Scene name="Menu">',
                '  <Label id="title" text="开始" />',
                '</Scene>',
                '',
            ].join('\n'),
            version: 'sha256:before',
        });
        const document = markRaw(await SceneDocument.open('src/scenes/Menu.scene', api));
        const wrapper = mount(InspectorPanel, {
            props: {
                document,
                revision: 0,
                selected: '0:title',
            },
        });

        expect((wrapper.get('input[data-prop="width"]').element as HTMLInputElement).value).toBe('120');
        expect((wrapper.get('input[data-prop="height"]').element as HTMLInputElement).value).toBe('28');
        expect((wrapper.get('input[data-prop="fontSize"]').element as HTMLInputElement).value).toBe('16');
        expect((wrapper.get('input[data-prop="wordWrap"]').element as HTMLInputElement).checked).toBe(false);
        expect(wrapper.get('select[data-prop="fontWeight"]').findAll('option').map((option) => option.text()))
            .toEqual(['400', '500', '600', '700', 'bold']);
        expect((wrapper.get('select[data-prop="alignX"]').element as HTMLSelectElement).value).toBe('start');
        expect((wrapper.get('select[data-prop="alignY"]').element as HTMLSelectElement).value).toBe('start');
        expect((wrapper.get('select[data-prop="overflow"]').element as HTMLSelectElement).value).toBe('visible');
        wrapper.unmount();
    });

    it('shows BitmapLabel box and typography fields in the Inspector', async () => {
        const api = createApi();
        api.readScene.mockResolvedValueOnce({
            path: 'src/scenes/Menu.scene',
            source: [
                '<Scene name="Menu">',
                '  <BitmapLabel id="gold" text="1280" fontFamily="AntCount" />',
                '</Scene>',
                '',
            ].join('\n'),
            version: 'sha256:before',
        });
        const document = markRaw(await SceneDocument.open('src/scenes/Menu.scene', api));
        const wrapper = mount(InspectorPanel, {
            props: {
                document,
                revision: 0,
                selected: '0:gold',
            },
        });

        expect((wrapper.get('input[data-prop="width"]').element as HTMLInputElement).value).toBe('120');
        expect((wrapper.get('input[data-prop="height"]').element as HTMLInputElement).value).toBe('28');
        expect((wrapper.get('input[data-prop="fontFamily"]').element as HTMLInputElement).value).toBe('AntCount');
        expect((wrapper.get('input[data-prop="fontSize"]').element as HTMLInputElement).value).toBe('16');
        expect((wrapper.get('input[data-prop="wordWrap"]').element as HTMLInputElement).checked).toBe(false);
        expect((wrapper.get('select[data-prop="alignX"]').element as HTMLSelectElement).value).toBe('start');
        expect((wrapper.get('select[data-prop="alignY"]').element as HTMLSelectElement).value).toBe('start');
        expect((wrapper.get('select[data-prop="overflow"]').element as HTMLSelectElement).value).toBe('visible');
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

    it('adds, duplicates, deletes, and reparents nodes from the hierarchy', async () => {
        const api = createApi();
        api.readScene.mockResolvedValueOnce({
            path: 'src/scenes/Menu.scene',
            source: [
                '<Scene name="Menu">',
                '  <Group id="panel" width="320" height="180">',
                '    <Text id="title" text="开始" />',
                '  </Group>',
                '  <Text id="footer" text="Footer" />',
                '</Scene>',
                '',
            ].join('\n'),
            version: 'sha256:before',
        });
        const document = markRaw(await SceneDocument.open('src/scenes/Menu.scene', api));
        const revision = ref(0);
        const selected = ref<string | undefined>('0:panel/0:title');
        document.subscribe((event) => {
            if (event.type !== 'commandApplied') return;
            revision.value += 1;
            selected.value = event.selection?.type === 'node' ? event.selection.node : undefined;
        });
        const wrapper = mount(defineComponent({
            setup() {
                return () => h(HierarchyPanel, {
                    document,
                    revision: revision.value,
                    selected: selected.value,
                });
            },
        }));

        expect(wrapper.find('[data-drag-handle]').exists()).toBe(false);

        await wrapper.get('select[aria-label="节点类型"]').setValue('Rect');
        await wrapper.get('button[aria-label="添加节点"]').trigger('click');
        await flushPromises();

        expect(document.source).toContain('<Rect id="rect"');
        expect(selected.value).toBe('0:panel/1:rect');

        await wrapper.get('button[aria-label="复制节点"]').trigger('click');
        await flushPromises();

        expect(document.source).toContain('<Rect id="rect2"');
        expect(selected.value).toBe('0:panel/2:rect2');

        await wrapper.get('button[aria-label="删除节点"]').trigger('click');
        await flushPromises();

        expect(document.source).not.toContain('id="rect2"');
        expect(selected.value).toBe('0:panel');

        const hierarchy = wrapper.get('.hierarchy-panel');
        expect(hierarchy.classes()).not.toContain('is-dragging');
        await wrapper.get('button[data-locator="1:footer"]').trigger('pointerdown');
        expect(hierarchy.classes()).toContain('is-dragging');
        const panelRow = wrapper.get('button[data-locator="0:panel"]');
        await panelRow.trigger('pointermove', { clientY: 13 });
        expect(panelRow.classes()).toContain('drop-inside');
        window.dispatchEvent(new Event('pointerup'));
        await flushPromises();

        expect(hierarchy.classes()).not.toContain('is-dragging');
        expect(document.source.indexOf('id="footer"')).toBeLessThan(document.source.indexOf('</Group>'));

        await wrapper.get('button[data-locator="0:panel/2:footer"]').trigger('pointerdown');
        const titleRow = wrapper.get('button[data-locator="0:panel/0:title"]');
        await titleRow.trigger('pointermove', { clientY: 1 });
        expect(titleRow.classes()).toContain('drop-before');
        window.dispatchEvent(new Event('pointerup'));
        await flushPromises();

        expect(document.source.indexOf('id="footer"')).toBeLessThan(document.source.indexOf('id="title"'));

        await wrapper.get('button[data-locator="0:panel"]').trigger('pointerdown');
        const rectRow = wrapper.get('button[data-locator="0:panel/2:rect"]');
        await rectRow.trigger('pointermove', { clientY: 1 });
        expect(rectRow.classes()).not.toContain('drop-before');
        window.dispatchEvent(new Event('pointerup'));
        await flushPromises();

        expect(api.writeScene).toHaveBeenCalledTimes(5);
        wrapper.unmount();
    });
});
