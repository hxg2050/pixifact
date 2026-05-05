import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    EditorDocument,
    button,
    group,
    prefab,
    roundedRect,
    textGraphic,
} from '../src';
import { createProjectExport } from '../apps/editor/src/services/projectSerializer';
import { parseProjectJson, validateProjectState } from '../apps/editor/src/services/projectValidator';

function createProjectDocument() {
    const document = new EditorDocument(prefab('测试项目',
        group('根节点', {
            id: 'root',
            key: 'root',
            width: 320,
            height: 180,
            components: [
                roundedRect({ color: 0x2563eb, radius: 8 }, 'bg'),
                button({ targetGraphic: 'bg', onClick: 'submitLogin' }, 'button'),
            ],
            children: [
                group('文本', {
                    key: 'label',
                    width: 160,
                    height: 40,
                    components: [
                        textGraphic({ text: '开始', center: true }, 'text'),
                    ],
                }),
            ],
        }),
    ));
    document.addAction({ key: 'submitLogin', label: '提交' });
    document.setSelection({ type: 'node', node: 'label' });
    document.dirty = false;
    return document;
}

describe('Editor app project services', () => {
    it('imports the bundled basic game sample project', () => {
        const json = readFileSync('sample-projects/basic-game/basic-game.ai-editor.json', 'utf8');
        const parsed = parseProjectJson(json);

        expect(parsed.ok).toBe(true);
        expect(parsed.errors).toEqual([]);
        expect(parsed.summary).toMatchObject({
            actionCount: 3,
            logicFlowCount: 3,
            memoryCount: 1,
        });
        expect(parsed.state?.prefab.name).toBe('基础游戏 HUD');
        expect(parsed.state?.selection).toEqual({ type: 'node', node: 'startBattleButton' });
    });

    it('validates and exports full editor project state', () => {
        const document = createProjectDocument();
        const exported = createProjectExport(document);

        expect(exported.ok).toBe(true);
        expect(exported.filename).toBe('测试项目.ai-editor.json');

        const parsed = parseProjectJson(exported.json ?? '');
        expect(parsed.ok).toBe(true);
        expect(parsed.summary).toMatchObject({
            nodeCount: 2,
            componentCount: 3,
            actionCount: 1,
        });
        expect(parsed.state?.selection).toEqual({ type: 'node', node: 'label' });
    });

    it('reports clear errors for invalid imported projects', () => {
        const missingProtocol = parseProjectJson(JSON.stringify({
            type: 'prefab',
            version: 1,
            name: 'OnlyPrefab',
        }));

        expect(missingProtocol.ok).toBe(false);
        expect(missingProtocol.errors.join('\n')).toContain('type');

        const duplicateNode = createProjectDocument().getState();
        duplicateNode.prefab.root.children?.push({
            type: 'Group',
            key: 'label',
        });
        const invalid = validateProjectState(duplicateNode);

        expect(invalid.ok).toBe(false);
        expect(invalid.errors.join('\n')).toContain('重复');
    });

    it('validates event props against the action registry', () => {
        const state = createProjectDocument().getState();
        state.actions = [];

        const invalid = validateProjectState(state);
        expect(invalid.ok).toBe(false);
        expect(invalid.errors.join('\n')).toContain('未声明动作 "submitLogin"');

        state.actions.push({ key: 'submitLogin', label: '提交' });
        const valid = validateProjectState(state);
        expect(valid.ok).toBe(true);
    });
});
