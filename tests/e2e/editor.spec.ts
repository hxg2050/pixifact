import { expect, test } from '@playwright/test';

test('editor restores dockview prototype layout and exposes MCP agent guidance', async ({ page }) => {
    await page.goto('/');

    const dockTab = (title: string) => page.locator('.dv-default-tab-content').filter({ hasText: new RegExp(`^${title}$`) });

    await expect(page.getByText('Pixifact Editor')).toBeVisible();
    await expect(dockTab('文件系统')).toBeVisible();
    await expect(dockTab('Scene')).toBeVisible();
    await expect(dockTab('视口')).toBeVisible();
    await expect(dockTab('Inspector')).toBeVisible();
    await expect(dockTab('Agent')).toBeVisible();

    await dockTab('Agent').dragTo(dockTab('视口'), { force: true });
    await expect(page.locator('.dv-groupview').filter({ has: dockTab('Agent') }).filter({ has: dockTab('视口') })).toHaveCount(1);

    await expect(page.getByTestId('resource-explorer')).toContainText('未打开文件夹');
    await expect(page.getByTestId('save-status')).toContainText('未打开项目文件夹');
    await expect(page.getByTestId('hierarchy-tree')).toContainText('按钮');
    await expect(page.getByText('使用 Codex / Claude Code 操作编辑器')).toBeVisible();
    await expect(page.getByTestId('mcp-status-bar')).toContainText('MCP Bridge');
    await expect(page.getByTestId('mcp-status-bar')).toContainText('bun run editor:mcp');
    await expect(page.getByTestId('mcp-status-bar')).toContainText('当前编辑对象');
    await expect(page.getByText('dry_run_commands')).toBeVisible();
    await expect(page.getByText('apply_commands')).toBeVisible();
    await expect(page.getByTestId('summary-bar')).toContainText('个节点');

    await page.evaluate(() => {
        class MockFileHandle {
            readonly kind = 'file';
            content: string;

            constructor(readonly name: string, content: string) {
                this.content = content;
            }

            async getFile() {
                return new File([this.content], this.name);
            }

            async createWritable() {
                return {
                    write: async (content: string) => {
                        this.content = content;
                    },
                    close: async () => {},
                };
            }
        }

        class MockDirectoryHandle {
            readonly kind = 'directory';

            constructor(
                readonly name: string,
                private children: Array<MockDirectoryHandle | MockFileHandle>,
            ) {}

            async *entries(): AsyncIterableIterator<[string, MockDirectoryHandle | MockFileHandle]> {
                for (const child of this.children) {
                    yield [child.name, child];
                }
            }

            async getFileHandle(name: string, options?: { create?: boolean }) {
                const existing = this.children.find((child) => child.name === name);
                if (existing instanceof MockFileHandle) {
                    return existing;
                }
                const file = new MockFileHandle(name, '');
                if (options?.create) {
                    this.children.push(file);
                }
                return file;
            }

            async getDirectoryHandle(name: string, options?: { create?: boolean }) {
                const existing = this.children.find((child) => child.name === name);
                if (existing instanceof MockDirectoryHandle) {
                    return existing;
                }
                const directory = new MockDirectoryHandle(name, []);
                if (options?.create || !existing) {
                    this.children.push(directory);
                }
                return directory;
            }

            async removeEntry(name: string) {
                this.children = this.children.filter((child) => child.name !== name);
            }
        }

        const inventoryScene = JSON.stringify({
            name: 'InventoryPanel',
            root: {
                kind: 'container',
                name: '背包面板',
                key: 'inventoryRoot',
                transform: { width: 520, height: 420 },
                children: [],
            },
        });
        const hudScene = JSON.stringify({
            version: 1,
            type: 'scene',
            name: 'HudPanel',
            root: {
                kind: 'container',
                name: 'HUD',
                key: 'hudRoot',
                transform: { width: 320, height: 80 },
                children: [
                    {
                        kind: 'shape',
                        name: 'Background',
                        key: 'hudBg',
                        transform: { width: 320, height: 80 },
                        shape: { type: 'roundedRect', color: 16777215, radius: 8 },
                    },
                    {
                        kind: 'text',
                        name: 'Score',
                        key: 'scoreLabel',
                        transform: { width: 120, height: 24 },
                        text: { value: 'Score', fontSize: 16 },
                    },
                ],
            },
        });

        const project = new MockDirectoryHandle('GameProject', [
            new MockDirectoryHandle('scenes', [
                new MockFileHandle('InventoryPanel.scene', inventoryScene),
                new MockFileHandle('HudPanel.scene', hudScene),
            ]),
            new MockDirectoryHandle('scripts', [
                new MockDirectoryHandle('components', [
                    new MockFileHandle('ButtonBinding.ts', ''),
                ]),
            ]),
            new MockFileHandle('README.md', ''),
        ]);

        window.showDirectoryPicker = async () => project as unknown as FileSystemDirectoryHandle;
    });

    await page.getByRole('button', { name: '打开文件夹' }).click();
    await expect(page.getByTestId('save-status')).toContainText('项目文件树已读取');
    await expect(page.getByTestId('resource-explorer')).toContainText('GameProject');
    await expect(page.getByTestId('resource-explorer')).toContainText('InventoryPanel.scene');
    await expect(page.getByTestId('resource-explorer')).toContainText('HudPanel.scene');
    await expect(page.getByTestId('resource-explorer')).toContainText('ButtonBinding.ts');
    await expect(page.getByTestId('file-preview')).toContainText('GameProject');
    await expect(page.getByTestId('file-preview')).toContainText('目录包含');
    await expect(page.getByTestId('project-file-section').getByRole('button', { name: /项目文件/ })).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('basic-component-library').getByRole('button', { name: '基础组件库' })).toHaveAttribute('aria-expanded', 'false');
    await page.getByTestId('basic-component-library').getByRole('button', { name: '基础组件库' }).click();
    await expect(page.getByTestId('project-file-section').getByRole('button', { name: /项目文件/ })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('basic-component-library')).toContainText('容器');
    await expect(page.getByTestId('basic-component-library')).toContainText('按钮');
    await expect(page.getByTestId('basic-component-library')).toContainText('文字');
    await expect(page.getByTestId('basic-component-library')).toContainText('图片');
    await expect(page.locator('[data-basic-component="button"]')).toBeVisible();
    await page.getByTestId('project-file-section').getByRole('button', { name: /项目文件/ }).click();
    await expect(page.getByTestId('basic-component-library').getByRole('button', { name: '基础组件库' })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('basic-component-library').locator('.accordionPanel')).not.toHaveClass(/open/);

    await page.locator('[data-file-id="GameProject/scenes/InventoryPanel.scene"]').dblclick();
    await expect(page.getByTestId('hierarchy-tree')).toContainText('背包面板');
    await expect(page.getByRole('banner')).toContainText('InventoryPanel.scene');

    await page.locator('[data-file-id="GameProject/scenes"]').click();
    await page.keyboard.press('Enter');
    await page.locator('[data-file-id="GameProject/scenes"]').click();
    await page.getByRole('button', { name: 'scenes 更多操作' }).click();
    await page.getByRole('menuitem', { name: '新建文件夹' }).click();
    await expect(page.getByTestId('file-preview')).toContainText('在 scenes 下输入文件夹名称。');
    await page.getByTestId('new-folder-name').fill('TempFolder');
    await page.getByTestId('create-folder').click();
    await expect(page.getByTestId('resource-explorer')).toContainText('TempFolder');

    await page.locator('[data-file-id="GameProject/scenes/TempFolder"]').click();
    await page.keyboard.press('F2');
    await page.getByTestId('inline-rename-entry').fill('RenamedFolder');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('resource-explorer')).toContainText('RenamedFolder');

    await page.locator('[data-file-id="GameProject/scenes"]').click();
    await page.getByTestId('new-scene-name').fill('MenuPanel');
    await page.getByTestId('create-scene').click();
    await expect(page.getByTestId('resource-explorer')).toContainText('MenuPanel.scene');
    await expect(page.getByTestId('hierarchy-tree')).toContainText('MenuPanel');
    await expect(page.getByRole('banner')).toContainText('MenuPanel.scene');

    const hierarchyTree = page.getByTestId('hierarchy-tree');
    const rootNode = hierarchyTree.locator('.nodeRow').filter({ hasText: 'MenuPanel' }).first();
    const selectRootNode = async () => {
        await rootNode.click();
    };

    await page.getByTestId('basic-component-library').getByRole('button', { name: '基础组件库' }).click();
    await page.locator('[data-basic-component="button"]').dragTo(rootNode);
    await expect(hierarchyTree).toContainText('按钮1');
    const buttonNode = hierarchyTree.locator('.nodeRow').filter({ hasText: '按钮1' }).first();
    await buttonNode.click({ button: 'right' });
    await page.getByTestId('node-menu-rename').click();
    await page.getByTestId('inline-rename-node').fill('开始按钮');
    await page.keyboard.press('Enter');
    await expect(hierarchyTree).toContainText('开始按钮');
    await hierarchyTree.locator('.nodeRow').filter({ hasText: '开始按钮' }).first().click({ button: 'right' });
    await page.getByTestId('node-menu-copy').click();
    await rootNode.click({ button: 'right' });
    await page.getByTestId('node-menu-paste').click();
    await expect(hierarchyTree).toContainText('开始按钮 副本');
    await hierarchyTree.locator('.nodeRow').filter({ hasText: '文字' }).first().click({ button: 'right' });
    await expect(page.getByTestId('node-menu-paste')).toBeDisabled();
    await page.keyboard.press('Escape');
    await selectRootNode();
    await page.locator('[data-basic-component="container"]').dragTo(rootNode);
    await expect(hierarchyTree).toContainText('容器1');
    await selectRootNode();
    await page.locator('[data-basic-component="text"]').dragTo(rootNode);
    await expect(hierarchyTree).toContainText('文字1');
    await selectRootNode();
    await page.locator('[data-basic-component="image"]').dragTo(rootNode);
    await expect(hierarchyTree).toContainText('图片1');
    const imageNode = hierarchyTree.locator('.nodeRow').filter({ hasText: '图片1' }).first();
    const textNode = hierarchyTree.locator('.nodeRow').filter({ hasText: '文字1' }).first();
    await imageNode.dragTo(textNode, {
        targetPosition: { x: 10, y: 2 },
    });
    const containerNode = hierarchyTree.locator('.nodeRow').filter({ hasText: '容器1' }).first();
    await textNode.dragTo(containerNode, {
        targetPosition: { x: 86, y: 13 },
    });
    await imageNode.click({ button: 'right' });
    await page.getByTestId('node-menu-delete').click();
    await expect(hierarchyTree).not.toContainText('图片1');
    await selectRootNode();
    await page.getByTestId('project-file-section').getByRole('button', { name: /项目文件/ }).click();
    await page.locator('[data-file-id="GameProject/scenes/HudPanel.scene"]').dragTo(
        rootNode,
    );
    await expect(hierarchyTree).toContainText('HudPanel 实例');
    await selectRootNode();

    await page.getByRole('textbox', { name: '名称', exact: true }).fill('SavedMenu');
    await page.locator('[data-file-id="GameProject/scenes/HudPanel.scene"]').dblclick();
    await expect(hierarchyTree).toContainText('SavedMenu');
    await expect(page.getByRole('banner')).toContainText('MenuPanel.scene');
    await page.getByRole('button', { name: '保存' }).click();
    await expect(page.getByTestId('save-status')).toContainText('已保存 MenuPanel.scene');
    const savedScene = await page.evaluate(async () => {
        const project = await window.showDirectoryPicker!();
        const scenes = await project.getDirectoryHandle('scenes');
        const file = await scenes.getFileHandle('MenuPanel.scene');
        return JSON.parse(await (await file.getFile()).text());
    });
    expect(savedScene.root.name).toBe('SavedMenu');
    expect(savedScene.root.children.map((node: { key: string }) => node.key)).toEqual(['button1', 'button1Copy', 'container1', 'hudPanelInstance1_hudRoot']);
    expect(savedScene.root.children[0].name).toBe('开始按钮');
    expect(savedScene.root.children[1].name).toBe('开始按钮 副本');
    expect(savedScene.root.children[0].components.map((component: { type: string }) => component.type)).toContain('ui.Button');
    expect(savedScene.root.children[1].children[0].key).toMatch(/^button1BgCopy/);
    expect(savedScene.root.children[1].components[0].props.targetGraphic).toBe(savedScene.root.children[1].children[0].key);
    expect(savedScene.root.children[2].children[0].key).toBe('text1');
    expect(savedScene.root.children[2].children[0].kind).toBe('text');
    expect(savedScene.root.children[3].name).toBe('HudPanel 实例');
    expect(savedScene.root.children[3].children[1].key).toBe('hudPanelInstance1_scoreLabel');
});
